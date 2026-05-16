"""Per-conversation context frame.

The frame is what gives the chat its "stickiness": when the manager says
"how many days did *they* take", `they` resolves to active_employee. The agent
reads the frame on each turn; the UI surfaces it so the manager can see and
reset what the agent is assuming.

Stored in-memory keyed by conversation_id. Fine for a sample — production
would persist this.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from threading import Lock


@dataclass
class ContextFrame:
    active_employee: str | None = None  # full_name
    active_team: str | None = None
    date_range: str | None = "2026"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Conversation:
    conversation_id: str
    manager_email: str
    frame: ContextFrame = field(default_factory=ContextFrame)
    messages: list[dict] = field(default_factory=list)
    # Each turn we keep the last view-spec so the UI can re-render, and so
    # "put that in a table instead" has something concrete to mutate.
    last_view_spec: dict | None = None


class ConversationStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._convos: dict[str, Conversation] = {}

    def get_or_create(self, conversation_id: str, manager_email: str) -> Conversation:
        with self._lock:
            convo = self._convos.get(conversation_id)
            if convo is None:
                convo = Conversation(conversation_id=conversation_id, manager_email=manager_email)
                self._convos[conversation_id] = convo
            elif convo.manager_email != manager_email:
                # Conversation belongs to a different manager — don't leak.
                raise PermissionError("Conversation belongs to a different manager.")
            return convo

    def reset_frame(self, conversation_id: str) -> None:
        with self._lock:
            convo = self._convos.get(conversation_id)
            if convo:
                convo.frame = ContextFrame()
                convo.last_view_spec = None


store = ConversationStore()
