"""Pydantic schemas for the agent's view-spec output.

The agent's only job is to produce a value of this shape. We validate it on
every turn — a malformed response is re-prompted with the validation error,
never heuristically repaired.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ViewType = Literal["bar_chart", "line_chart", "pie_chart", "table", "stat", "map"]


class CubeFilter(BaseModel):
    model_config = ConfigDict(extra="allow")
    member: str
    operator: str
    values: list[str] | None = None


class CubeTimeDimension(BaseModel):
    model_config = ConfigDict(extra="allow")
    dimension: str
    dateRange: str | list[str] | None = None
    granularity: str | None = None


class CubeQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    measures: list[str] = Field(default_factory=list)
    dimensions: list[str] = Field(default_factory=list)
    filters: list[CubeFilter] = Field(default_factory=list)
    timeDimensions: list[CubeTimeDimension] = Field(default_factory=list)
    order: dict[str, Literal["asc", "desc"]] | None = None
    limit: int | None = None


class View(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: ViewType
    # Charts
    x: str | None = None
    y: str | None = None
    series: str | None = None
    # Tables
    columns: list[str] | None = None
    # Maps — cube field names for lat, lng, and the pin label
    lat_key: str | None = None
    lng_key: str | None = None
    label_key: str | None = None


class FrameUpdate(BaseModel):
    """Optional frame update the agent can request.

    The agent can suggest updates to the context frame when it has resolved an
    entity from natural language (e.g. "tell me about Chloe Davies" → set
    active_employee). The backend applies these conservatively — never widens
    scope, only sets entity references.
    """

    model_config = ConfigDict(extra="forbid")
    active_employee: str | None = None
    active_team: str | None = None
    date_range: str | None = None


class ViewSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    narrative: str
    cube_query: CubeQuery
    view: View
    frame_update: FrameUpdate | None = None
