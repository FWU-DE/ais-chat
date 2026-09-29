import { describe, expect, it } from 'vitest';
import {
  getApprovableStates,
  getRejectableStates,
  mapRequestRowsToDetailAdmin,
  mapRequestRowsToSummaries,
  resolveEntityNameAndType,
  resolveEntityReference,
} from './community-template-service.admin';
import { InvalidArgumentError, NotFoundError } from '@shared/error';
import type {
  CommunityTemplateRequestEventSelectModel,
  CommunityTemplateRequestSelectModel,
} from '@shared/db/schema';

function buildRequest(
  overrides: Partial<CommunityTemplateRequestSelectModel> = {},
): CommunityTemplateRequestSelectModel {
  return {
    id: 'request-1',
    assistantId: null,
    characterId: null,
    learningScenarioId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 'user-1',
    state: 'submitted',
    note: '',
    ...overrides,
  };
}

function buildEvent(
  overrides: Partial<CommunityTemplateRequestEventSelectModel> = {},
): CommunityTemplateRequestEventSelectModel {
  return {
    id: 'event-1',
    templateRequestId: 'request-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdById: 'editor-1',
    createdByName: 'Editor',
    createdByRole: 'editor',
    eventType: 'submit',
    message: '',
    ...overrides,
  };
}

describe('resolveEntityReference', () => {
  it('resolves a character reference', () => {
    const request = buildRequest({ characterId: 'character-1' });
    expect(resolveEntityReference(request)).toEqual({
      entityType: 'character',
      entityId: 'character-1',
    });
  });

  it('resolves an assistant reference', () => {
    const request = buildRequest({ assistantId: 'assistant-1' });
    expect(resolveEntityReference(request)).toEqual({
      entityType: 'assistant',
      entityId: 'assistant-1',
    });
  });

  it('resolves a learning scenario reference', () => {
    const request = buildRequest({ learningScenarioId: 'learning-scenario-1' });
    expect(resolveEntityReference(request)).toEqual({
      entityType: 'learningScenario',
      entityId: 'learning-scenario-1',
    });
  });

  it('throws if no entity id is set', () => {
    const request = buildRequest();
    expect(() => resolveEntityReference(request)).toThrow(InvalidArgumentError);
  });
});

describe('resolveEntityNameAndType', () => {
  it('picks the name matching the populated entity id', () => {
    const request = buildRequest({ assistantId: 'assistant-1' });
    const result = resolveEntityNameAndType(request, {
      assistantName: 'My Assistant',
      characterName: null,
      learningScenarioName: null,
    });
    expect(result).toEqual({ entityType: 'assistant', entityName: 'My Assistant' });
  });

  it('throws if the joined name is missing', () => {
    const request = buildRequest({ characterId: 'character-1' });
    expect(() =>
      resolveEntityNameAndType(request, {
        assistantName: null,
        characterName: null,
        learningScenarioName: null,
      }),
    ).toThrow(InvalidArgumentError);
  });
});

describe('getApprovableStates / getRejectableStates', () => {
  it('allows approving from submitted or rejected', () => {
    expect(getApprovableStates()).toEqual(['submitted', 'rejected']);
  });

  it('allows rejecting only from submitted', () => {
    expect(getRejectableStates()).toEqual(['submitted']);
  });
});

describe('mapRequestRowsToSummaries', () => {
  it('maps joined rows to summaries with resolved entity name and type', () => {
    const request = buildRequest({ id: 'request-1', characterId: 'character-1' });
    const result = mapRequestRowsToSummaries([
      {
        request,
        assistantName: null,
        characterName: 'My Character',
        learningScenarioName: null,
        latestEventCreatedAt: new Date('2026-02-01T00:00:00Z'),
        latestEventCreatedByRole: 'user',
      },
    ]);

    expect(result).toEqual([
      {
        ...request,
        entityType: 'character',
        entityName: 'My Character',
        latestEventCreatedAt: new Date('2026-02-01T00:00:00Z'),
        latestEventCreatedByRole: 'user',
      },
    ]);
  });

  it('maps multiple rows independently', () => {
    const requestA = buildRequest({ id: 'request-a', assistantId: 'assistant-1' });
    const requestB = buildRequest({ id: 'request-b', learningScenarioId: 'learning-scenario-1' });
    const result = mapRequestRowsToSummaries([
      {
        request: requestA,
        assistantName: 'Assistant A',
        characterName: null,
        learningScenarioName: null,
        latestEventCreatedAt: new Date('2026-02-01T00:00:00Z'),
        latestEventCreatedByRole: 'editor',
      },
      {
        request: requestB,
        assistantName: null,
        characterName: null,
        learningScenarioName: 'Scenario B',
        latestEventCreatedAt: new Date('2026-02-02T00:00:00Z'),
        latestEventCreatedByRole: 'user',
      },
    ]);

    expect(
      result.map((r) => ({ id: r.id, entityType: r.entityType, entityName: r.entityName })),
    ).toEqual([
      { id: 'request-a', entityType: 'assistant', entityName: 'Assistant A' },
      { id: 'request-b', entityType: 'learningScenario', entityName: 'Scenario B' },
    ]);
  });
});

describe('mapRequestRowsToDetailAdmin', () => {
  it('groups events for the request and resolves entity name and type', () => {
    const request = buildRequest({ id: 'request-1', assistantId: 'assistant-1' });
    const submitEvent = buildEvent({ id: 'event-1', eventType: 'submit' });
    const approveEvent = buildEvent({
      id: 'event-2',
      eventType: 'approve',
      createdByRole: 'editor',
    });

    const result = mapRequestRowsToDetailAdmin([
      {
        request,
        assistantName: 'My Assistant',
        characterName: null,
        learningScenarioName: null,
        event: submitEvent,
      },
      {
        request,
        assistantName: 'My Assistant',
        characterName: null,
        learningScenarioName: null,
        event: approveEvent,
      },
    ]);

    expect(result).toEqual({
      ...request,
      entityType: 'assistant',
      entityName: 'My Assistant',
      events: [submitEvent, approveEvent],
    });
  });

  it('throws NotFoundError when no rows are given', () => {
    expect(() => mapRequestRowsToDetailAdmin([])).toThrow(NotFoundError);
  });
});
