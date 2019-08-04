import {
  isRequestAction,
  isResponseAction,
  getRequestActionFromResponse,
} from '../actions';
import defaultConfig from './default-config';
import requestsReducer from './requests-reducer';
import operationsReducer from './operations-reducer';

const isRequestReadOnlyDefault = ({ request, meta }) =>
  !!(meta && meta.asQuery) ||
  (!request.query &&
    (!request.method || request.method.toLowerCase() === 'get')) ||
  (request.query && !request.query.trim().startsWith('mutation'));

export default localConfig => {
  const config = {
    isRequestReadOnly: isRequestReadOnlyDefault,
    ...defaultConfig,
    ...localConfig,
    handleOperationsState: false,
  };
  let initialized = false; // for SSR hydration
  let initReducers = null;
  const requestsReducers = {};

  return (state = { queries: {}, mutations: {} }, action) => {
    if (
      !initialized &&
      Object.keys(state.queries).length > 0 &&
      Object.keys(requestsReducers).length === 0
    ) {
      initialized = true;
      const queryKeys = Object.keys(state.queries);
      initReducers = new Set(queryKeys);

      queryKeys.forEach(k => {
        requestsReducers[k] = requestsReducer({
          ...config,
          actionType: k,
        });
      });
    }

    if (
      isRequestAction(action) &&
      config.isRequestReadOnly(action) &&
      (!(action.type in requestsReducers) ||
        (initReducers && initReducers.has(action.type)))
    ) {
      requestsReducers[action.type] = requestsReducer({
        ...config,
        actionType: action.type,
        ...action.meta,
      });

      if (initReducers) {
        initReducers.delete(action.type);
      }
    }

    const queries = Object.entries(requestsReducers).reduce(
      (prev, [actionType, reducer]) => {
        prev[actionType] = reducer(state.queries[actionType], action);
        return prev;
      },
      {},
    );

    let { mutations } = state;

    if (
      (isRequestAction(action) && !config.isRequestReadOnly(action)) ||
      (isResponseAction(action) &&
        !config.isRequestReadOnly(getRequestActionFromResponse(action)))
    ) {
      mutations = operationsReducer(mutations, action, config, {
        getRequestKey:
          action.meta && action.meta.operations
            ? action.meta.operations.getRequestKey
            : null,
      });
    }

    return {
      queries,
      mutations,
    };
  };
};