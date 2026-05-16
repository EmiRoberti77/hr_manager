// Cube configuration — the security context lives here.
//
// Every request the MCP server makes carries a signed JWT whose claims become
// `securityContext`. queryRewrite injects the manager's team as a mandatory
// filter on every query. If no scope is present we throw — never default to
// "see everything".

module.exports = {
  queryRewrite: (query, { securityContext }) => {
    if (!securityContext || !securityContext.team) {
      throw new Error('No manager scope on request — refusing to query.');
    }

    query.filters = query.filters || [];
    query.filters.push({
      member: 'employees.team',
      operator: 'equals',
      values: [securityContext.team],
    });

    return query;
  },
};
