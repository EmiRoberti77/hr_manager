# Low-Level Implementation Details

## Core Implementation Architecture

This document provides detailed implementation specifics, code flows, data structures, and technical decisions for the HR Analytics Platform.

## Request Processing Pipeline

### 1. Authentication Flow

```python
# api/auth.py - Authentication Implementation
class AuthenticationFlow:
    """
    Request → Header Extraction → Identity Resolution → Session Creation
    """
    
    def get_manager(request: Request) -> ManagerIdentity:
        # Step 1: Extract demo header (production: JWT from cookie)
        demo_user = request.headers.get("X-Demo-User")
        
        # Step 2: Validate against known users
        if demo_user not in DEMO_USERS:
            raise HTTPException(401, "Unauthorized")
        
        # Step 3: Resolve team scope
        user_data = DEMO_USERS[demo_user]
        
        # Step 4: Lookup employee_id from database
        employee_id = lookup_employee_id(demo_user)
        
        # Step 5: Return identity with scope
        return ManagerIdentity(
            email=demo_user,
            team=user_data["team"],
            role=user_data["role"],
            employee_id=employee_id
        )
```

### 2. Agent Loop Implementation

```python
# api/agent.py - Tool-use Loop
class AgentLoop:
    """
    Maximum 6 iterations to reach terminal state (submit_view)
    """
    
    async def run_turn(conversation: Conversation, message: str) -> ViewSpec:
        # Step 1: Prepare context
        context_xml = f"""
        <context_frame>
            <active_employee>{conversation.frame.active_employee}</active_employee>
            <active_team>{conversation.frame.active_team}</active_team>
            <date_range>{conversation.frame.date_range}</date_range>
        </context_frame>
        """
        
        # Step 2: Build messages with context
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": context_xml + message}
        ]
        
        # Step 3: Tool loop (max 6 iterations)
        for iteration in range(6):
            response = await anthropic.messages.create(
                model="claude-3-5-sonnet",
                messages=messages,
                tools=TOOLS,
                max_tokens=4096
            )
            
            # Step 4: Process tool calls
            for tool_use in response.tool_uses:
                if tool_use.name == "submit_view":
                    # Terminal state - validate and return
                    return ViewSpec(**tool_use.input)
                
                # Execute tool and append result
                result = await execute_tool(tool_use)
                messages.append({
                    "role": "assistant",
                    "content": response.content
                })
                messages.append({
                    "role": "user",
                    "content": f"<tool_result>{result}</tool_result>"
                })
        
        raise MaxIterationsError("Failed to produce view spec")
```

## Data Flow Architecture

### 1. Cube Query Construction

```typescript
// Frontend → Backend → Cube → PostgreSQL

interface CubeQuery {
    measures: string[];        // ["manager_analytics.headcount"]
    dimensions: string[];      // ["manager_analytics.team"]
    filters: Filter[];        // Auto-injected team filter
    timeDimensions: TimeDim[]; // Date ranges
    limit?: number;           // Default 5000
    offset?: number;          // Pagination
}

// api/tools.py - Query Execution
class CubeQueryExecutor:
    def query_hr_metrics(cube_query: dict, manager: ManagerIdentity):
        # Step 1: Mint scoped JWT
        jwt_payload = {
            "team": manager.team,
            "exp": time.time() + 300,  # 5 min expiry
            "iat": time.time()
        }
        token = jwt.encode(jwt_payload, CUBE_API_SECRET, "HS256")
        
        # Step 2: Normalize time dimensions
        for td in cube_query.get("timeDimensions", []):
            if isinstance(td["dateRange"], str):
                # "2026" → ["2026-01-01", "2026-12-31"]
                td["dateRange"] = normalize_year(td["dateRange"])
        
        # Step 3: Execute query
        response = httpx.post(
            "http://localhost:4000/cubejs-api/v1/load",
            json={"query": cube_query},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Step 4: Audit log
        audit_entry = {
            "manager_email": manager.email,
            "manager_team": manager.team,
            "cube_query": json.dumps(cube_query),
            "row_count": len(response.json()["data"]),
            "timestamp": datetime.utcnow()
        }
        insert_audit_log(audit_entry)
        
        return response.json()["data"]
```

### 2. Cube Security Implementation

```javascript
// cube/cube.js - Query Rewrite for Team Scoping
module.exports = {
    queryRewrite: (query, { securityContext }) => {
        // Critical: Enforce team filter on EVERY query
        if (!securityContext.team) {
            throw new Error('Security context missing team scope');
        }
        
        // Inject mandatory team filter
        const teamFilter = {
            member: 'employees.team',
            operator: 'equals',
            values: [securityContext.team]
        };
        
        // Ensure filter is always present
        query.filters = query.filters || [];
        
        // Check if team filter already exists
        const hasTeamFilter = query.filters.some(f => 
            f.member === 'employees.team'
        );
        
        if (!hasTeamFilter) {
            query.filters.push(teamFilter);
        }
        
        return query;
    },
    
    // Context extractor from JWT
    contextToAppId: ({ securityContext }) => {
        return `team_${securityContext.team}`;
    },
    
    // Pre-aggregation partitioning
    preAggregationsSchema: ({ securityContext }) => {
        return `pre_agg_${securityContext.team.toLowerCase()}`;
    }
};
```

## Database Implementation Details

### 1. Row-Level Security Policies

```sql
-- db/rls.sql - PostgreSQL RLS Implementation

-- Enable RLS on all sensitive tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_events ENABLE ROW LEVEL SECURITY;

-- Create policies for team-scoped access
CREATE POLICY employees_team_policy ON employees
    FOR SELECT
    USING (
        -- Check session variable set by API
        team = current_setting('app.manager_team', true)
        OR current_setting('app.is_hr_admin', true) = 'true'
    );

CREATE POLICY absences_team_policy ON absences
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            WHERE e.id = absences.employee_id
            AND e.team = current_setting('app.manager_team', true)
        )
        OR current_setting('app.is_hr_admin', true) = 'true'
    );

-- Audit log is INSERT-only for api_writer role
CREATE POLICY audit_insert_only ON audit_log
    FOR INSERT
    TO api_writer
    WITH CHECK (true);

-- No SELECT/UPDATE/DELETE on audit_log for api_writer
CREATE POLICY audit_no_read ON audit_log
    FOR SELECT
    TO api_writer
    USING (false);
```

### 2. Session Management

```python
# api/context.py - Conversation State Management
class ConversationStore:
    """
    In-memory store (production: Redis/PostgreSQL)
    """
    def __init__(self):
        self._conversations: Dict[str, Conversation] = {}
        self._lock = asyncio.Lock()
    
    async def get_or_create(
        self,
        conversation_id: str,
        manager_email: str
    ) -> Conversation:
        async with self._lock:
            if conversation_id in self._conversations:
                conv = self._conversations[conversation_id]
                # Security: Verify same manager
                if conv.manager_email != manager_email:
                    raise PermissionError(
                        f"Conversation belongs to different manager"
                    )
                return conv
            
            # Create new conversation
            conv = Conversation(
                id=conversation_id,
                manager_email=manager_email,
                frame=ContextFrame(
                    active_employee=None,
                    active_team=None,
                    date_range=str(datetime.now().year)
                ),
                messages=[]
            )
            self._conversations[conversation_id] = conv
            return conv
    
    async def update_frame(
        self,
        conversation_id: str,
        frame_update: dict
    ):
        async with self._lock:
            conv = self._conversations.get(conversation_id)
            if conv:
                for key, value in frame_update.items():
                    setattr(conv.frame, key, value)
```

## View Rendering Pipeline

### 1. View Spec Validation

```python
# api/view_spec.py - Pydantic Models
from pydantic import BaseModel, validator

class ViewSpec(BaseModel):
    narrative: str
    cube_query: CubeQuery
    view: ViewConfig
    frame_update: Optional[FrameUpdate]
    
    @validator('view')
    def validate_view_type(cls, v):
        valid_types = {
            'bar_chart', 'line_chart', 'pie_chart',
            'table', 'stat', 'map'
        }
        if v.type not in valid_types:
            raise ValueError(f"Invalid view type: {v.type}")
        return v
    
    @validator('cube_query')
    def validate_cube_members(cls, v):
        # Ensure all members use manager_analytics prefix
        for measure in v.measures:
            if not measure.startswith('manager_analytics.'):
                raise ValueError(f"Invalid measure: {measure}")
        for dimension in v.dimensions:
            if not dimension.startswith('manager_analytics.'):
                raise ValueError(f"Invalid dimension: {dimension}")
        return v
```

### 2. Frontend View Renderer

```tsx
// web/src/ViewRenderer.tsx - Dynamic Component Rendering
import { BarChart, LineChart, PieChart } from 'recharts';

interface ViewRendererProps {
    spec: ViewSpec;
    data: any[];
    onRowClick?: (row: any) => void;
}

export function ViewRenderer({ spec, data, onRowClick }: ViewRendererProps) {
    // Transform data based on view type
    const transformData = () => {
        switch (spec.view.type) {
            case 'bar_chart':
                return data.map(row => ({
                    name: row[spec.view.x],
                    value: row[spec.view.y]
                }));
            
            case 'table':
                return {
                    columns: spec.view.columns.map(col => ({
                        Header: col.title,
                        accessor: col.key
                    })),
                    data: data
                };
            
            case 'stat':
                const total = data[0]?.[spec.view.measure] || 0;
                return { value: total, label: spec.view.label };
            
            case 'map':
                return data.map(row => ({
                    lat: row['manager_analytics.latitude'],
                    lng: row['manager_analytics.longitude'],
                    label: row['manager_analytics.full_name']
                }));
            
            default:
                return data;
        }
    };
    
    // Render appropriate component
    switch (spec.view.type) {
        case 'bar_chart':
            return (
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={transformData()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#8884d8" />
                    </BarChart>
                </ResponsiveContainer>
            );
        
        case 'table':
            const { columns, data: tableData } = transformData();
            return (
                <Table
                    columns={columns}
                    data={tableData}
                    onRowClick={onRowClick}
                />
            );
        
        case 'map':
            return <MapView markers={transformData()} />;
        
        // ... other view types
    }
}
```

## Policy RAG Implementation

### 1. Document Ingestion Pipeline

```python
# api/policy_ingest.py - PDF Processing
class PolicyIngester:
    def __init__(self):
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.embedder = OpenAI()
    
    async def ingest_document(
        self,
        file_path: str,
        team: str,
        category: str
    ) -> int:
        # Step 1: Extract text from PDF
        reader = PdfReader(file_path)
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()
        
        # Step 2: Chunk into ~500 token segments
        chunks = self.chunk_text(full_text, max_tokens=500)
        
        # Step 3: Generate embeddings
        document_id = await self.create_document_record(
            file_path, team, category
        )
        
        for idx, chunk in enumerate(chunks):
            # Generate embedding
            response = await self.embedder.embeddings.create(
                model="text-embedding-3-small",
                input=chunk
            )
            embedding = response.data[0].embedding
            
            # Store chunk with vector
            await self.store_chunk(
                document_id=document_id,
                chunk_text=chunk,
                chunk_index=idx,
                embedding=embedding  # vector(1536)
            )
        
        return document_id
    
    def chunk_text(self, text: str, max_tokens: int = 500):
        """Smart chunking with overlap"""
        sentences = text.split('. ')
        chunks = []
        current_chunk = []
        current_tokens = 0
        
        for sentence in sentences:
            tokens = len(self.tokenizer.encode(sentence))
            
            if current_tokens + tokens > max_tokens:
                # Save current chunk
                chunks.append('. '.join(current_chunk))
                # Start new chunk with overlap
                current_chunk = current_chunk[-2:]  # Keep last 2 sentences
                current_tokens = sum(
                    len(self.tokenizer.encode(s)) 
                    for s in current_chunk
                )
            
            current_chunk.append(sentence)
            current_tokens += tokens
        
        if current_chunk:
            chunks.append('. '.join(current_chunk))
        
        return chunks
```

### 2. Vector Search Implementation

```python
# api/policy_rag.py - Retrieval and Answer Generation
class PolicyRAG:
    async def retrieve_and_answer(
        self,
        query: str,
        team: str,
        conversation_id: str
    ) -> PolicyAnswer:
        # Step 1: Embed the query
        query_embedding = await self.embed_query(query)
        
        # Step 2: Vector similarity search with team filter
        chunks = await self.vector_search(
            query_embedding=query_embedding,
            team=team,
            limit=5
        )
        
        # Step 3: Prepare context for LLM
        context = self.format_chunks_as_context(chunks)
        
        # Step 4: Generate answer with Claude
        messages = [
            {
                "role": "system",
                "content": """You are an HR assistant. Answer questions 
                based ONLY on the provided policy excerpts. Always cite 
                the source document."""
            },
            {
                "role": "user",
                "content": f"""
                Policy excerpts:
                {context}
                
                Question: {query}
                
                Provide a clear answer with citations.
                """
            }
        ]
        
        response = await anthropic.messages.create(
            model="claude-3-5-sonnet",
            messages=messages,
            max_tokens=1000
        )
        
        # Step 5: Audit and return
        await self.audit_query(query, team, chunks)
        
        return PolicyAnswer(
            answer=response.content,
            sources=[
                {
                    "document": chunk.document_title,
                    "page": chunk.page_number,
                    "excerpt": chunk.text[:200]
                }
                for chunk in chunks
            ]
        )
    
    async def vector_search(
        self,
        query_embedding: list,
        team: str,
        limit: int = 5
    ):
        """PostgreSQL pgvector similarity search"""
        sql = """
        SELECT 
            c.id,
            c.chunk_text,
            c.chunk_index,
            d.title as document_title,
            d.category,
            c.embedding <=> %s::vector as distance
        FROM policy_chunks c
        JOIN policy_documents d ON c.document_id = d.id
        WHERE d.team = %s
        AND d.status = 'ready'
        ORDER BY distance
        LIMIT %s
        """
        
        async with get_db_session() as conn:
            result = await conn.execute(
                sql,
                (query_embedding, team, limit)
            )
            return result.fetchall()
```

## Expense Processing Implementation

### 1. Receipt Vision Extraction

```python
# api/expense_extract.py - Claude Vision Integration
class ExpenseExtractor:
    async def extract_receipt(
        self,
        image_path: str,
        expense_id: int
    ) -> ExtractedData:
        # Step 1: Encode image
        with open(image_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode()
        
        # Step 2: Claude vision prompt
        messages = [{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": """Extract receipt information and return JSON:
                    {
                        "merchant": "store name",
                        "date": "YYYY-MM-DD",
                        "total": 0.00,
                        "currency": "USD",
                        "line_items": [
                            {
                                "description": "item",
                                "quantity": 1,
                                "amount": 0.00
                            }
                        ]
                    }"""
                },
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image_data
                    }
                }
            ]
        }]
        
        # Step 3: Extract with Claude
        response = await anthropic.messages.create(
            model="claude-3-5-sonnet",
            messages=messages,
            max_tokens=2000
        )
        
        # Step 4: Parse and validate
        try:
            extracted = json.loads(response.content)
            
            # Step 5: Update expense record
            await self.update_expense(
                expense_id=expense_id,
                merchant=extracted.get('merchant'),
                date=extracted.get('date'),
                total=Decimal(str(extracted.get('total', 0))),
                extraction_raw=extracted,
                status='draft'
            )
            
            # Step 6: Insert line items
            for item in extracted.get('line_items', []):
                await self.insert_line_item(
                    expense_id=expense_id,
                    description=item['description'],
                    quantity=item.get('quantity', 1),
                    amount=Decimal(str(item['amount']))
                )
            
            return ExtractedData(**extracted)
            
        except (json.JSONDecodeError, ValueError) as e:
            await self.mark_failed(expense_id, str(e))
            raise ExtractionError(f"Failed to extract: {e}")
```

### 2. Expense State Machine

```python
# api/expenses.py - Status Transitions
class ExpenseStateMachine:
    TRANSITIONS = {
        'processing': ['draft', 'failed'],
        'draft': ['submitted', 'processing'],  # Can reprocess
        'submitted': [],  # Terminal state
        'failed': ['processing']  # Can retry
    }
    
    async def transition(
        self,
        expense_id: int,
        from_status: str,
        to_status: str,
        employee_id: int
    ):
        # Validate transition
        if to_status not in self.TRANSITIONS.get(from_status, []):
            raise ValueError(
                f"Invalid transition: {from_status} → {to_status}"
            )
        
        # Execute transition with audit
        async with get_db_transaction() as tx:
            # Verify ownership
            expense = await tx.fetchone(
                "SELECT * FROM expenses WHERE id = %s AND employee_id = %s",
                (expense_id, employee_id)
            )
            
            if not expense:
                raise PermissionError("Not your expense")
            
            if expense['status'] != from_status:
                raise ValueError(f"Expected status {from_status}")
            
            # Update status
            await tx.execute(
                """UPDATE expenses 
                   SET status = %s, updated_at = NOW() 
                   WHERE id = %s""",
                (to_status, expense_id)
            )
            
            # Audit log
            await tx.execute(
                """INSERT INTO expense_audit 
                   (expense_id, from_status, to_status, changed_by, changed_at)
                   VALUES (%s, %s, %s, %s, NOW())""",
                (expense_id, from_status, to_status, employee_id)
            )
```

## Performance Optimizations

### 1. Cube Pre-Aggregations

```yaml
# cube/model/cubes/employees.yml
cubes:
  - name: employees
    pre_aggregations:
      - name: headcount_by_team_daily
        type: rollup
        measures:
          - headcount
          - active_headcount
        dimensions:
          - team
        time_dimension: employment_events.event_date
        granularity: day
        refresh_key:
          every: 1 hour
        
      - name: turnover_monthly
        type: rollup
        measures:
          - turnover_rate
        dimensions:
          - team
        time_dimension: employment_events.event_date
        granularity: month
        refresh_key:
          every: 6 hours
```

### 2. Database Query Optimization

```sql
-- Covering indexes for common queries
CREATE INDEX idx_absences_employee_date 
ON absences(employee_id, absence_date, absence_type)
INCLUDE (reason);

CREATE INDEX idx_employees_team_active 
ON employees(team, is_active)
INCLUDE (full_name, role, location);

-- Partial index for active employees only
CREATE INDEX idx_active_employees 
ON employees(team) 
WHERE is_active = true;

-- BRIN index for time-series data
CREATE INDEX idx_audit_timestamp_brin 
ON audit_log USING BRIN(timestamp);

-- GiST index for vector similarity
CREATE INDEX idx_chunks_embedding 
ON policy_chunks USING ivfflat(embedding vector_cosine_ops)
WITH (lists = 100);
```

## Error Handling & Recovery

### 1. Circuit Breaker Pattern

```python
# api/circuit_breaker.py
class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60
    ):
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.last_failure_time = None
        self.state = 'closed'  # closed, open, half_open
    
    async def call(self, func, *args, **kwargs):
        if self.state == 'open':
            if self._should_attempt_reset():
                self.state = 'half_open'
            else:
                raise CircuitOpenError("Service unavailable")
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        
        except Exception as e:
            self._on_failure()
            raise
    
    def _on_success(self):
        self.failure_count = 0
        self.state = 'closed'
    
    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.failure_count >= self.failure_threshold:
            self.state = 'open'
    
    def _should_attempt_reset(self):
        return (
            time.time() - self.last_failure_time 
            > self.recovery_timeout
        )

# Usage in API calls
cube_circuit = CircuitBreaker()
anthropic_circuit = CircuitBreaker(failure_threshold=3)

async def query_with_circuit(query):
    return await cube_circuit.call(
        execute_cube_query,
        query
    )
```

### 2. Retry Logic with Exponential Backoff

```python
# api/retry.py
async def retry_with_backoff(
    func,
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0
):
    delay = initial_delay
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            return await func()
        
        except Exception as e:
            last_exception = e
            
            if attempt < max_retries - 1:
                # Calculate next delay with jitter
                delay = min(
                    delay * exponential_base + random.uniform(0, 1),
                    max_delay
                )
                
                await asyncio.sleep(delay)
            
            # Log retry attempt
            logger.warning(
                f"Retry {attempt + 1}/{max_retries} after {delay:.1f}s: {e}"
            )
    
    raise last_exception
```

## Monitoring & Instrumentation

### 1. OpenTelemetry Integration

```python
# api/telemetry.py
from opentelemetry import trace, metrics
from opentelemetry.exporter.otlp.proto.grpc import (
    trace_exporter,
    metrics_exporter
)

# Initialize tracing
tracer = trace.get_tracer("hr-platform")
meter = metrics.get_meter("hr-platform")

# Create metrics
request_counter = meter.create_counter(
    "http_requests_total",
    description="Total HTTP requests"
)

query_histogram = meter.create_histogram(
    "cube_query_duration_seconds",
    description="Cube query execution time"
)

token_counter = meter.create_counter(
    "llm_tokens_total",
    description="Total LLM tokens used"
)

# Instrumentation decorator
def trace_endpoint(name: str):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            with tracer.start_as_current_span(name) as span:
                # Add attributes
                span.set_attribute("endpoint", name)
                span.set_attribute("user", kwargs.get('manager', {}).email)
                
                try:
                    result = await func(*args, **kwargs)
                    span.set_status(StatusCode.OK)
                    return result
                
                except Exception as e:
                    span.record_exception(e)
                    span.set_status(StatusCode.ERROR, str(e))
                    raise
        
        return wrapper
    return decorator
```

### 2. Custom Metrics Collection

```python
# api/metrics.py
class MetricsCollector:
    def __init__(self):
        self.redis = Redis()
    
    async def record_query_metrics(
        self,
        query_type: str,
        execution_time: float,
        row_count: int,
        team: str
    ):
        # Increment counters
        await self.redis.hincrby(
            f"metrics:{datetime.now():%Y-%m-%d}",
            f"queries:{team}:{query_type}",
            1
        )
        
        # Update histograms
        bucket = self._get_time_bucket(execution_time)
        await self.redis.hincrby(
            f"metrics:histograms:{datetime.now():%Y-%m-%d}",
            f"query_time:{bucket}",
            1
        )
        
        # Track p95/p99
        await self.redis.zadd(
            f"metrics:percentiles:{datetime.now():%Y-%m-%d}",
            {f"{query_type}:{execution_time}": time.time()}
        )
    
    def _get_time_bucket(self, seconds: float) -> str:
        if seconds < 0.1:
            return "<100ms"
        elif seconds < 0.5:
            return "100-500ms"
        elif seconds < 1.0:
            return "500ms-1s"
        elif seconds < 5.0:
            return "1s-5s"
        else:
            return ">5s"
```