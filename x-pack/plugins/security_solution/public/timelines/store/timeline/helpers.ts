/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getOr, omit, uniq, isEmpty, isEqualWith, cloneDeep, union } from 'lodash/fp';

import uuid from 'uuid';

import type { Filter } from '@kbn/es-query';

import type { TimelineNonEcsData } from '../../../../common/search_strategy';
import type { Sort } from '../../components/timeline/body/sort';
import type {
  DataProvider,
  QueryOperator,
  QueryMatch,
} from '../../components/timeline/data_providers/data_provider';
import {
  DataProviderType,
  IS_OPERATOR,
  EXISTS_OPERATOR,
} from '../../components/timeline/data_providers/data_provider';
import type {
  ColumnHeaderOptions,
  TimelineEventsType,
  TimelineTypeLiteral,
  RowRendererId,
  SerializedFilterQuery,
  TimelinePersistInput,
  ToggleDetailPanel,
  TimelineExpandedDetail,
  SortColumnTimeline,
} from '../../../../common/types/timeline';
import { TimelineType, TimelineStatus, TimelineId } from '../../../../common/types/timeline';
import { normalizeTimeRange } from '../../../common/utils/normalize_time_range';
import { getTimelineManageDefaults, timelineDefaults } from './defaults';
import type { KqlMode, TimelineModel } from './model';
import type { TimelineById, TimelineModelSettings } from './types';
import {
  DEFAULT_FROM_MOMENT,
  DEFAULT_TO_MOMENT,
} from '../../../common/utils/default_date_settings';
import {
  DEFAULT_COLUMN_MIN_WIDTH,
  RESIZED_COLUMN_MIN_WITH,
} from '../../components/timeline/body/constants';
import { activeTimeline } from '../../containers/active_timeline_context';
import type { ResolveTimelineConfig } from '../../components/open_timeline/types';
import type { SessionViewConfig } from '../../components/timeline/session_tab_content/use_session_view';
export const isNotNull = <T>(value: T | null): value is T => value !== null;

interface AddTimelineNoteParams {
  id: string;
  noteId: string;
  timelineById: TimelineById;
}

export const addTimelineNote = ({
  id,
  noteId,
  timelineById,
}: AddTimelineNoteParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      noteIds: [...timeline.noteIds, noteId],
    },
  };
};

interface AddTimelineNoteToEventParams {
  id: string;
  noteId: string;
  eventId: string;
  timelineById: TimelineById;
}

export const addTimelineNoteToEvent = ({
  id,
  noteId,
  eventId,
  timelineById,
}: AddTimelineNoteToEventParams): TimelineById => {
  const timeline = timelineById[id];
  const existingNoteIds = getOr([], `eventIdToNoteIds.${eventId}`, timeline);

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      eventIdToNoteIds: {
        ...timeline.eventIdToNoteIds,
        ...{ [eventId]: uniq([...existingNoteIds, noteId]) },
      },
    },
  };
};

interface AddTimelineParams {
  id: string;
  resolveTimelineConfig?: ResolveTimelineConfig;
  timeline: TimelineModel;
  timelineById: TimelineById;
}

export const shouldResetActiveTimelineContext = (
  id: string,
  oldTimeline: TimelineModel,
  newTimeline: TimelineModel
) => {
  if (id === TimelineId.active && oldTimeline.savedObjectId !== newTimeline.savedObjectId) {
    return true;
  }
  return false;
};

/**
 * Add a saved object timeline to the store
 * and default the value to what need to be if values are null
 */
export const addTimelineToStore = ({
  id,
  resolveTimelineConfig,
  timeline,
  timelineById,
}: AddTimelineParams): TimelineById => {
  if (shouldResetActiveTimelineContext(id, timelineById[id], timeline)) {
    activeTimeline.setActivePage(0);
    activeTimeline.setExpandedDetail({});
  }
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      filterManager: timelineById[id].filterManager,
      isLoading: timelineById[id].isLoading,
      initialized: timelineById[id].initialized,
      resolveTimelineConfig,
      dateRange:
        timeline.status === TimelineStatus.immutable &&
        timeline.timelineType === TimelineType.template
          ? {
              start: DEFAULT_FROM_MOMENT.toISOString(),
              end: DEFAULT_TO_MOMENT.toISOString(),
            }
          : timeline.dateRange,
    },
  };
};

interface AddNewTimelineParams extends TimelinePersistInput {
  timelineById: TimelineById;
  timelineType: TimelineTypeLiteral;
}

/** Adds a new `Timeline` to the provided collection of `TimelineById` */
export const addNewTimeline = ({
  id,
  timelineById,
  timelineType,
  dateRange: maybeDateRange,
  ...timelineProps
}: AddNewTimelineParams): TimelineById => {
  const timeline = timelineById[id];
  const { from: startDateRange, to: endDateRange } = normalizeTimeRange({ from: '', to: '' });
  const dateRange = maybeDateRange ?? { start: startDateRange, end: endDateRange };
  const templateTimelineInfo =
    timelineType === TimelineType.template
      ? {
          templateTimelineId: uuid.v4(),
          templateTimelineVersion: 1,
        }
      : {};
  return {
    ...timelineById,
    [id]: {
      id,
      ...(timeline ? timeline : {}),
      ...timelineDefaults,
      ...timelineProps,
      dateRange,
      savedObjectId: null,
      version: null,
      isSaving: false,
      isLoading: false,
      timelineType,
      ...templateTimelineInfo,
    },
  };
};

interface PinTimelineEventParams {
  id: string;
  eventId: string;
  timelineById: TimelineById;
}

export const pinTimelineEvent = ({
  id,
  eventId,
  timelineById,
}: PinTimelineEventParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      pinnedEventIds: {
        ...timeline.pinnedEventIds,
        ...{ [eventId]: true },
      },
    },
  };
};

interface UpdateShowTimelineProps {
  id: string;
  show: boolean;
  timelineById: TimelineById;
}

export const updateTimelineShowTimeline = ({
  id,
  show,
  timelineById,
}: UpdateShowTimelineProps): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      show,
    },
  };
};

export const updateTimelineGraphEventId = ({
  id,
  graphEventId,
  timelineById,
}: {
  id: string;
  graphEventId: string;
  timelineById: TimelineById;
}): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      graphEventId,
      ...(graphEventId === '' && id === TimelineId.active
        ? { activeTab: timeline.prevActiveTab, prevActiveTab: timeline.activeTab }
        : {}),
    },
  };
};

export const updateTimelineSessionViewConfig = ({
  id,
  sessionViewConfig,
  timelineById,
}: {
  id: string;
  sessionViewConfig: SessionViewConfig | null;
  timelineById: TimelineById;
}): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      sessionViewConfig,
    },
  };
};

const queryMatchCustomizer = (dp1: QueryMatch, dp2: QueryMatch) => {
  if (dp1.field === dp2.field && dp1.value === dp2.value && dp1.operator === dp2.operator) {
    return true;
  }
  return false;
};

const addAndToProvidersInTimeline = (
  id: string,
  providers: DataProvider[],
  timeline: TimelineModel,
  timelineById: TimelineById
): TimelineById => {
  if (providers.length === 0) return timelineById;
  let localDataProviders: DataProvider[] = cloneDeep(timeline.dataProviders);

  providers.forEach((provider) => {
    const alreadyExistsProviderIndex = localDataProviders.findIndex(
      (p) => p.id === timeline.highlightedDropAndProviderId
    );
    const newProvider = localDataProviders[alreadyExistsProviderIndex];
    const alreadyExistsAndProviderIndex = newProvider.and.findIndex((p) => p.id === provider.id);
    const { and, ...andProvider } = provider;

    if (
      isEqualWith(queryMatchCustomizer, newProvider.queryMatch, andProvider.queryMatch) ||
      (alreadyExistsAndProviderIndex === -1 &&
        newProvider.and.filter((itemAndProvider) =>
          isEqualWith(queryMatchCustomizer, itemAndProvider.queryMatch, andProvider.queryMatch)
        ).length > 0)
    ) {
      return timelineById;
    }

    localDataProviders = [
      ...localDataProviders.slice(0, alreadyExistsProviderIndex),
      {
        ...localDataProviders[alreadyExistsProviderIndex],
        and:
          alreadyExistsAndProviderIndex > -1
            ? [
                ...newProvider.and.slice(0, alreadyExistsAndProviderIndex),
                andProvider,
                ...newProvider.and.slice(alreadyExistsAndProviderIndex + 1),
              ]
            : [...newProvider.and, andProvider],
      },
      ...localDataProviders.slice(alreadyExistsProviderIndex + 1),
    ];
  });
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      dataProviders: localDataProviders,
    },
  };
};

const addProvidersToTimeline = (
  id: string,
  providers: DataProvider[],
  timeline: TimelineModel,
  timelineById: TimelineById
): TimelineById => {
  if (providers.length === 0) return timelineById;

  let localDataProviders: DataProvider[] = cloneDeep(timeline.dataProviders);

  providers.forEach((provider) => {
    const alreadyExistsAtIndex = localDataProviders.findIndex((p) => p.id === provider.id);

    if (alreadyExistsAtIndex > -1 && !isEmpty(localDataProviders[alreadyExistsAtIndex].and)) {
      provider.id = `${provider.id}-${
        localDataProviders.filter((p) => p.id === provider.id).length
      }`;
    }

    localDataProviders =
      alreadyExistsAtIndex > -1 && isEmpty(localDataProviders[alreadyExistsAtIndex].and)
        ? [
            ...localDataProviders.slice(0, alreadyExistsAtIndex),
            provider,
            ...localDataProviders.slice(alreadyExistsAtIndex + 1),
          ]
        : [...localDataProviders, provider];
  });

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      dataProviders: localDataProviders,
    },
  };
};

interface AddTimelineColumnParams {
  column: ColumnHeaderOptions;
  id: string;
  index: number;
  timelineById: TimelineById;
}

/**
 * Adds or updates a column. When updating a column, it will be moved to the
 * new index
 */
export const upsertTimelineColumn = ({
  column,
  id,
  index,
  timelineById,
}: AddTimelineColumnParams): TimelineById => {
  const timeline = timelineById[id];
  const alreadyExistsAtIndex = timeline.columns.findIndex((c) => c.id === column.id);

  if (alreadyExistsAtIndex !== -1) {
    // remove the existing entry and add the new one at the specified index
    const reordered = timeline.columns.filter((c) => c.id !== column.id);
    reordered.splice(index, 0, column); // ⚠️ mutation

    return {
      ...timelineById,
      [id]: {
        ...timeline,
        columns: reordered,
      },
    };
  }

  // add the new entry at the specified index
  const columns = [...timeline.columns];
  columns.splice(index, 0, column); // ⚠️ mutation

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      columns,
    },
  };
};

interface RemoveTimelineColumnParams {
  id: string;
  columnId: string;
  timelineById: TimelineById;
}

export const removeTimelineColumn = ({
  id,
  columnId,
  timelineById,
}: RemoveTimelineColumnParams): TimelineById => {
  const timeline = timelineById[id];

  const columns = timeline.columns.filter((c) => c.id !== columnId);

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      columns,
    },
  };
};

interface ApplyDeltaToTimelineColumnWidth {
  id: string;
  columnId: string;
  delta: number;
  timelineById: TimelineById;
}

export const applyDeltaToTimelineColumnWidth = ({
  id,
  columnId,
  delta,
  timelineById,
}: ApplyDeltaToTimelineColumnWidth): TimelineById => {
  const timeline = timelineById[id];

  const columnIndex = timeline.columns.findIndex((c) => c.id === columnId);
  if (columnIndex === -1) {
    // the column was not found
    return {
      ...timelineById,
      [id]: {
        ...timeline,
      },
    };
  }

  const requestedWidth =
    (timeline.columns[columnIndex].initialWidth ?? DEFAULT_COLUMN_MIN_WIDTH) + delta; // raw change in width
  const initialWidth = Math.max(RESIZED_COLUMN_MIN_WITH, requestedWidth); // if the requested width is smaller than the min, use the min

  const columnWithNewWidth = {
    ...timeline.columns[columnIndex],
    initialWidth,
  };

  const columns = [
    ...timeline.columns.slice(0, columnIndex),
    columnWithNewWidth,
    ...timeline.columns.slice(columnIndex + 1),
  ];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      columns,
    },
  };
};

interface AddTimelineProviderParams {
  id: string;
  providers: DataProvider[];
  timelineById: TimelineById;
}

export const addTimelineProviders = ({
  id,
  providers,
  timelineById,
}: AddTimelineProviderParams): TimelineById => {
  const timeline = timelineById[id];
  if (timeline.highlightedDropAndProviderId !== '') {
    return addAndToProvidersInTimeline(id, providers, timeline, timelineById);
  } else {
    return addProvidersToTimeline(id, providers, timeline, timelineById);
  }
};

interface ApplyKqlFilterQueryDraftParams {
  id: string;
  filterQuery: SerializedFilterQuery;
  timelineById: TimelineById;
}

export const applyKqlFilterQueryDraft = ({
  id,
  filterQuery,
  timelineById,
}: ApplyKqlFilterQueryDraftParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      kqlQuery: {
        ...timeline.kqlQuery,
        filterQuery,
      },
    },
  };
};

interface UpdateTimelineKqlModeParams {
  id: string;
  kqlMode: KqlMode;
  timelineById: TimelineById;
}

export const updateTimelineKqlMode = ({
  id,
  kqlMode,
  timelineById,
}: UpdateTimelineKqlModeParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      kqlMode,
    },
  };
};

interface UpdateTimelineColumnsParams {
  id: string;
  columns: ColumnHeaderOptions[];
  timelineById: TimelineById;
}

export const updateTimelineColumns = ({
  id,
  columns,
  timelineById,
}: UpdateTimelineColumnsParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      columns,
    },
  };
};

interface UpdateTimelineTitleAndDescriptionParams {
  description: string;
  id: string;
  title: string;
  timelineById: TimelineById;
}

export const updateTimelineTitleAndDescription = ({
  description,
  id,
  title,
  timelineById,
}: UpdateTimelineTitleAndDescriptionParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      description: description.trim(),
      title: title.trim(),
    },
  };
};

interface UpdateTimelineEventTypeParams {
  id: string;
  eventType: TimelineEventsType;
  timelineById: TimelineById;
}

export const updateTimelineEventType = ({
  id,
  eventType,
  timelineById,
}: UpdateTimelineEventTypeParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      eventType,
    },
  };
};

interface UpdateTimelineIsFavoriteParams {
  id: string;
  isFavorite: boolean;
  timelineById: TimelineById;
}

export const updateTimelineIsFavorite = ({
  id,
  isFavorite,
  timelineById,
}: UpdateTimelineIsFavoriteParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      isFavorite,
    },
  };
};

interface UpdateTimelineProvidersParams {
  id: string;
  providers: DataProvider[];
  timelineById: TimelineById;
}

export const updateTimelineProviders = ({
  id,
  providers,
  timelineById,
}: UpdateTimelineProvidersParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      dataProviders: providers,
    },
  };
};

interface UpdateTimelineRangeParams {
  id: string;
  start: string;
  end: string;
  timelineById: TimelineById;
}

export const updateTimelineRange = ({
  id,
  start,
  end,
  timelineById,
}: UpdateTimelineRangeParams): TimelineById => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      dateRange: {
        start,
        end,
      },
    },
  };
};

interface UpdateTimelineSortParams {
  id: string;
  sort: Sort[];
  timelineById: TimelineById;
}

export const updateTimelineSort = ({
  id,
  sort,
  timelineById,
}: UpdateTimelineSortParams): TimelineById => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      sort,
    },
  };
};

const updateEnabledAndProvider = (
  andProviderId: string,
  enabled: boolean,
  providerId: string,
  timeline: TimelineModel
) =>
  timeline.dataProviders.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          and: provider.and.map((andProvider) =>
            andProvider.id === andProviderId ? { ...andProvider, enabled } : andProvider
          ),
        }
      : provider
  );

const updateEnabledProvider = (enabled: boolean, providerId: string, timeline: TimelineModel) =>
  timeline.dataProviders.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          enabled,
        }
      : provider
  );

interface UpdateTimelineProviderEnabledParams {
  id: string;
  providerId: string;
  enabled: boolean;
  timelineById: TimelineById;
  andProviderId?: string;
}

export const updateTimelineProviderEnabled = ({
  id,
  providerId,
  enabled,
  timelineById,
  andProviderId,
}: UpdateTimelineProviderEnabledParams): TimelineById => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      dataProviders: andProviderId
        ? updateEnabledAndProvider(andProviderId, enabled, providerId, timeline)
        : updateEnabledProvider(enabled, providerId, timeline),
    },
  };
};

const updateExcludedAndProvider = (
  andProviderId: string,
  excluded: boolean,
  providerId: string,
  timeline: TimelineModel
) =>
  timeline.dataProviders.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          and: provider.and.map((andProvider) =>
            andProvider.id === andProviderId ? { ...andProvider, excluded } : andProvider
          ),
        }
      : provider
  );

const updateExcludedProvider = (excluded: boolean, providerId: string, timeline: TimelineModel) =>
  timeline.dataProviders.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          excluded,
        }
      : provider
  );

interface UpdateTimelineProviderExcludedParams {
  id: string;
  providerId: string;
  excluded: boolean;
  timelineById: TimelineById;
  andProviderId?: string;
}

export const updateTimelineProviderExcluded = ({
  id,
  providerId,
  excluded,
  timelineById,
  andProviderId,
}: UpdateTimelineProviderExcludedParams): TimelineById => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      dataProviders: andProviderId
        ? updateExcludedAndProvider(andProviderId, excluded, providerId, timeline)
        : updateExcludedProvider(excluded, providerId, timeline),
    },
  };
};

const updateProviderProperties = ({
  excluded,
  field,
  operator,
  providerId,
  timeline,
  value,
}: {
  excluded: boolean;
  field: string;
  operator: QueryOperator;
  providerId: string;
  timeline: TimelineModel;
  value: string | number;
}) =>
  timeline.dataProviders.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          excluded,
          queryMatch: {
            ...provider.queryMatch,
            field,
            displayField: field,
            value,
            displayValue: value,
            operator,
          },
        }
      : provider
  );

const updateAndProviderProperties = ({
  andProviderId,
  excluded,
  field,
  operator,
  providerId,
  timeline,
  value,
}: {
  andProviderId: string;
  excluded: boolean;
  field: string;
  operator: QueryOperator;
  providerId: string;
  timeline: TimelineModel;
  value: string | number;
}) =>
  timeline.dataProviders.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          and: provider.and.map((andProvider) =>
            andProvider.id === andProviderId
              ? {
                  ...andProvider,
                  excluded,
                  queryMatch: {
                    ...andProvider.queryMatch,
                    field,
                    displayField: field,
                    value,
                    displayValue: value,
                    operator,
                  },
                }
              : andProvider
          ),
        }
      : provider
  );

interface UpdateTimelineProviderEditPropertiesParams {
  andProviderId?: string;
  excluded: boolean;
  field: string;
  id: string;
  operator: QueryOperator;
  providerId: string;
  timelineById: TimelineById;
  value: string | number;
}

export const updateTimelineProviderProperties = ({
  andProviderId,
  excluded,
  field,
  id,
  operator,
  providerId,
  timelineById,
  value,
}: UpdateTimelineProviderEditPropertiesParams): TimelineById => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      dataProviders: andProviderId
        ? updateAndProviderProperties({
            andProviderId,
            excluded,
            field,
            operator,
            providerId,
            timeline,
            value,
          })
        : updateProviderProperties({
            excluded,
            field,
            operator,
            providerId,
            timeline,
            value,
          }),
    },
  };
};

interface UpdateTimelineProviderTypeParams {
  andProviderId?: string;
  id: string;
  providerId: string;
  type: DataProviderType;
  timelineById: TimelineById;
}

const updateTypeAndProvider = (
  andProviderId: string,
  type: DataProviderType,
  providerId: string,
  timeline: TimelineModel
) =>
  timeline.dataProviders.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          and: provider.and.map((andProvider) =>
            andProvider.id === andProviderId
              ? {
                  ...andProvider,
                  type,
                  name: type === DataProviderType.template ? `${andProvider.queryMatch.field}` : '',
                  queryMatch: {
                    ...andProvider.queryMatch,
                    displayField: undefined,
                    displayValue: undefined,
                    value:
                      type === DataProviderType.template ? `{${andProvider.queryMatch.field}}` : '',
                    operator: (type === DataProviderType.template
                      ? IS_OPERATOR
                      : EXISTS_OPERATOR) as QueryOperator,
                  },
                }
              : andProvider
          ),
        }
      : provider
  );

const updateTypeProvider = (type: DataProviderType, providerId: string, timeline: TimelineModel) =>
  timeline.dataProviders.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          type,
          name: type === DataProviderType.template ? `${provider.queryMatch.field}` : '',
          queryMatch: {
            ...provider.queryMatch,
            displayField: undefined,
            displayValue: undefined,
            value: type === DataProviderType.template ? `{${provider.queryMatch.field}}` : '',
            operator: (type === DataProviderType.template
              ? IS_OPERATOR
              : EXISTS_OPERATOR) as QueryOperator,
          },
        }
      : provider
  );

export const updateTimelineProviderType = ({
  andProviderId,
  id,
  providerId,
  type,
  timelineById,
}: UpdateTimelineProviderTypeParams): TimelineById => {
  const timeline = timelineById[id];

  if (timeline.timelineType !== TimelineType.template && type === DataProviderType.template) {
    // Not supported, timeline template cannot have template type providers
    return timelineById;
  }

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      dataProviders: andProviderId
        ? updateTypeAndProvider(andProviderId, type, providerId, timeline)
        : updateTypeProvider(type, providerId, timeline),
    },
  };
};

interface UpdateTimelineItemsPerPageParams {
  id: string;
  itemsPerPage: number;
  timelineById: TimelineById;
}

export const updateTimelineItemsPerPage = ({
  id,
  itemsPerPage,
  timelineById,
}: UpdateTimelineItemsPerPageParams) => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      itemsPerPage,
    },
  };
};

interface UpdateTimelinePerPageOptionsParams {
  id: string;
  itemsPerPageOptions: number[];
  timelineById: TimelineById;
}

export const updateTimelinePerPageOptions = ({
  id,
  itemsPerPageOptions,
  timelineById,
}: UpdateTimelinePerPageOptionsParams) => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      itemsPerPageOptions,
    },
  };
};

const removeAndProvider = (andProviderId: string, providerId: string, timeline: TimelineModel) => {
  const providerIndex = timeline.dataProviders.findIndex((p) => p.id === providerId);
  const providerAndIndex = timeline.dataProviders[providerIndex]?.and.findIndex(
    (p) => p.id === andProviderId
  );

  return [
    ...timeline.dataProviders.slice(0, providerIndex),
    {
      ...timeline.dataProviders[providerIndex],
      and: timeline.dataProviders[providerIndex]?.and
        ? [
            ...timeline.dataProviders[providerIndex]?.and.slice(0, providerAndIndex),
            ...timeline.dataProviders[providerIndex]?.and.slice(providerAndIndex + 1),
          ]
        : [],
    },
    ...timeline.dataProviders.slice(providerIndex + 1),
  ];
};

const removeProvider = (providerId: string, timeline: TimelineModel) => {
  const providerIndex = timeline.dataProviders.findIndex((p) => p.id === providerId);
  return [
    ...timeline.dataProviders.slice(0, providerIndex),
    ...(timeline.dataProviders[providerIndex]?.and.length
      ? [
          {
            ...timeline.dataProviders[providerIndex].and.slice(0, 1)[0],
            and: [...timeline.dataProviders[providerIndex].and.slice(1)],
          },
        ]
      : []),
    ...timeline.dataProviders.slice(providerIndex + 1),
  ];
};

interface RemoveTimelineProviderParams {
  id: string;
  providerId: string;
  timelineById: TimelineById;
  andProviderId?: string;
}

export const removeTimelineProvider = ({
  id,
  providerId,
  timelineById,
  andProviderId,
}: RemoveTimelineProviderParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      dataProviders: andProviderId
        ? removeAndProvider(andProviderId, providerId, timeline)
        : removeProvider(providerId, timeline),
    },
  };
};

interface UnPinTimelineEventParams {
  id: string;
  eventId: string;
  timelineById: TimelineById;
}

export const unPinTimelineEvent = ({
  id,
  eventId,
  timelineById,
}: UnPinTimelineEventParams): TimelineById => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      pinnedEventIds: omit(eventId, timeline.pinnedEventIds),
    },
  };
};

interface UpdateSavedQueryParams {
  id: string;
  savedQueryId: string | null;
  timelineById: TimelineById;
}

export const updateSavedQuery = ({
  id,
  savedQueryId,
  timelineById,
}: UpdateSavedQueryParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      savedQueryId,
    },
  };
};

interface UpdateFiltersParams {
  id: string;
  filters: Filter[];
  timelineById: TimelineById;
}

export const updateFilters = ({ id, filters, timelineById }: UpdateFiltersParams): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      filters,
    },
  };
};

interface UpdateExcludedRowRenderersIds {
  id: string;
  excludedRowRendererIds: RowRendererId[];
  timelineById: TimelineById;
}

export const updateExcludedRowRenderersIds = ({
  id,
  excludedRowRendererIds,
  timelineById,
}: UpdateExcludedRowRenderersIds): TimelineById => {
  const timeline = timelineById[id];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      excludedRowRendererIds,
    },
  };
};

export const updateTimelineDetailsPanel = (action: ToggleDetailPanel): TimelineExpandedDetail => {
  const { tabType, id, ...expandedDetails } = action;

  const panelViewOptions = new Set(['eventDetail', 'hostDetail', 'networkDetail', 'userDetail']);
  const expandedTabType = tabType ?? 'query';
  const newExpandDetails = {
    params: expandedDetails.params ? { ...expandedDetails.params } : {},
    panelView: expandedDetails.panelView,
  } as TimelineExpandedDetail;
  return {
    [expandedTabType]: panelViewOptions.has(expandedDetails.panelView ?? '')
      ? newExpandDetails
      : {},
  };
};

interface SetLoadingTableEventsParams {
  id: string;
  eventIds: string[];
  isLoading: boolean;
  timelineById: TimelineById;
}

export const setLoadingTableEvents = ({
  id,
  eventIds,
  isLoading,
  timelineById,
}: SetLoadingTableEventsParams): TimelineById => {
  const timeline = timelineById[id];

  const loadingEventIds = isLoading
    ? union(timeline.loadingEventIds, eventIds)
    : timeline.loadingEventIds.filter((currentEventId) => !eventIds.includes(currentEventId));

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      loadingEventIds,
    },
  };
};

interface RemoveTableColumnParams {
  id: string;
  columnId: string;
  timelineById: TimelineById;
}

export const removeTableColumn = ({
  id,
  columnId,
  timelineById,
}: RemoveTableColumnParams): TimelineById => {
  const timeline = timelineById[id];

  const columns = timeline.columns.filter((c) => c.id !== columnId);

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      columns,
    },
  };
};

/**
 * Adds or updates a column. When updating a column, it will be moved to the
 * new index
 */
export const upsertTableColumn = ({
  column,
  id,
  index,
  timelineById,
}: AddTimelineColumnParams): TimelineById => {
  const timeline = timelineById[id];
  const alreadyExistsAtIndex = timeline.columns.findIndex((c) => c.id === column.id);

  if (alreadyExistsAtIndex !== -1) {
    // remove the existing entry and add the new one at the specified index
    const reordered = timeline.columns.filter((c) => c.id !== column.id);
    reordered.splice(index, 0, column); // ⚠️ mutation

    return {
      ...timelineById,
      [id]: {
        ...timeline,
        columns: reordered,
      },
    };
  }
  // add the new entry at the specified index
  const columns = [...timeline.columns];
  columns.splice(index, 0, column); // ⚠️ mutation

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      columns,
    },
  };
};

interface UpdateTableColumnsParams {
  id: string;
  columns: ColumnHeaderOptions[];
  timelineById: TimelineById;
}

export const updateTableColumns = ({
  id,
  columns,
  timelineById,
}: UpdateTableColumnsParams): TimelineById => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      columns,
    },
  };
};

interface UpdateTableSortParams {
  id: string;
  sort: SortColumnTimeline[];
  timelineById: TimelineById;
}

export const updateTableSort = ({
  id,
  sort,
  timelineById,
}: UpdateTableSortParams): TimelineById => {
  const timeline = timelineById[id];
  return {
    ...timelineById,
    [id]: {
      ...timeline,
      sort,
    },
  };
};

interface SetSelectedTableEventsParams {
  id: string;
  eventIds: Record<string, TimelineNonEcsData[]>;
  isSelectAllChecked: boolean;
  isSelected: boolean;
  timelineById: TimelineById;
}

export const setSelectedTableEvents = ({
  id,
  eventIds,
  isSelectAllChecked = false,
  isSelected,
  timelineById,
}: SetSelectedTableEventsParams): TimelineById => {
  const timeline = timelineById[id];

  const selectedEventIds = isSelected
    ? { ...timeline.selectedEventIds, ...eventIds }
    : omit(Object.keys(eventIds), timeline.selectedEventIds);

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      selectedEventIds,
      isSelectAllChecked,
    },
  };
};

interface SetDeletedTableEventsParams {
  id: string;
  eventIds: string[];
  isDeleted: boolean;
  timelineById: TimelineById;
}

export const setDeletedTableEvents = ({
  id,
  eventIds,
  isDeleted,
  timelineById,
}: SetDeletedTableEventsParams): TimelineById => {
  const timeline = timelineById[id];

  const deletedEventIds = isDeleted
    ? union(timeline.deletedEventIds, eventIds)
    : timeline.deletedEventIds.filter((currentEventId) => !eventIds.includes(currentEventId));

  const selectedEventIds = Object.fromEntries(
    Object.entries(timeline.selectedEventIds).filter(
      ([selectedEventId]) => !deletedEventIds.includes(selectedEventId)
    )
  );

  const isSelectAllChecked =
    Object.keys(selectedEventIds).length > 0 ? timeline.isSelectAllChecked : false;

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      deletedEventIds,
      selectedEventIds,
      isSelectAllChecked,
    },
  };
};

interface InitializeTimelineParams {
  id: string;
  timelineById: TimelineById;
  timelineSettingsProps: Partial<TimelineModelSettings>;
}

export const setInitializeTimelineSettings = ({
  id,
  timelineById,
  timelineSettingsProps,
}: InitializeTimelineParams): TimelineById => {
  const timeline = timelineById[id];

  return !timeline?.initialized
    ? {
        ...timelineById,
        [id]: {
          ...timelineDefaults,
          ...getTimelineManageDefaults(id),
          ...timeline,
          ...timelineSettingsProps,
          ...(!timeline ||
          (isEmpty(timeline.columns) && !isEmpty(timelineSettingsProps.defaultColumns))
            ? { columns: timelineSettingsProps.defaultColumns }
            : {}),
          sort: timelineSettingsProps.sort ?? timelineDefaults.sort,
          loadingEventIds: timelineDefaults.loadingEventIds,
          initialized: true,
        },
      }
    : timelineById;
};

interface ApplyDeltaToTableColumnWidth {
  id: string;
  columnId: string;
  delta: number;
  timelineById: TimelineById;
}

export const applyDeltaToTableColumnWidth = ({
  id,
  columnId,
  delta,
  timelineById,
}: ApplyDeltaToTableColumnWidth): TimelineById => {
  const timeline = timelineById[id];

  const columnIndex = timeline.columns.findIndex((c) => c.id === columnId);
  if (columnIndex === -1) {
    // the column was not found
    return {
      ...timelineById,
      [id]: {
        ...timeline,
      },
    };
  }

  const requestedWidth =
    (timeline.columns[columnIndex].initialWidth ?? DEFAULT_COLUMN_MIN_WIDTH) + delta; // raw change in width
  const initialWidth = Math.max(RESIZED_COLUMN_MIN_WITH, requestedWidth); // if the requested width is smaller than the min, use the min

  const columnWithNewWidth = {
    ...timeline.columns[columnIndex],
    initialWidth,
  };

  const columns = [
    ...timeline.columns.slice(0, columnIndex),
    columnWithNewWidth,
    ...timeline.columns.slice(columnIndex + 1),
  ];

  return {
    ...timelineById,
    [id]: {
      ...timeline,
      columns,
    },
  };
};
