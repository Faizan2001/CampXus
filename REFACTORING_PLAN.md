# HomePage.js Refactoring Plan

## Current Issues

- 5,174 lines in a single file (should be <500 lines per file)
- Mixed responsibilities (state, UI, data, events)
- Inconsistent state management
- Complex async operations scattered throughout
- Duplicate code and logic

## Proposed Structure

### 1. Core Architecture

```
src/js/pages/HomePage/
├── index.js                    # Main page controller (100-150 lines)
├── state/
│   ├── ScheduleState.js       # Centralized state management
│   ├── ComparisonState.js     # Comparison-specific state
│   └── ViewState.js           # UI view state (mobile/desktop)
├── services/
│   ├── ScheduleService.js     # Schedule CRUD operations
│   ├── ComparisonService.js   # Schedule comparison logic
│   └── FriendsService.js      # Friends schedule management
├── components/
│   ├── ScheduleGrid.js        # Grid rendering
│   ├── DayView.js             # Mobile day view
│   ├── UserList.js            # User management
│   └── ComparisonView.js      # Comparison UI
├── utils/
│   ├── scheduleConverters.js  # Data format conversions
│   ├── scheduleValidators.js  # Data validation
│   └── scheduleCalculators.js # Schedule calculations
└── hooks/
    ├── useScheduleData.js     # Data fetching hooks
    ├── useComparison.js       # Comparison logic
    └── useResponsive.js       # Mobile/desktop handling
```

### 2. State Management Improvements

#### Current Problems:

- Multiple state objects
- Direct mutations
- No state synchronization
- Async operations mixed with state updates

#### Solution: Centralized State with Reducers

```javascript
// state/ScheduleState.js
class ScheduleState {
  constructor() {
    this.state = {
      users: new Map(),
      activeUserId: null,
      compareMode: false,
      selectedUserIds: new Set(),
      viewMode: "day",
      selectedDay: new Date().getDay(),
    };
    this.listeners = new Set();
  }

  // Immutable state updates
  updateState(updater) {
    const newState = updater(this.state);
    this.state = { ...this.state, ...newState };
    this.notifyListeners();
  }

  // Async operations with proper error handling
  async loadUserSchedule(userId) {
    try {
      this.updateState((state) => ({ loading: true }));
      const schedule = await scheduleService.getSchedule(userId);
      this.updateState((state) => ({
        users: new Map(state.users).set(userId, schedule),
        loading: false,
      }));
    } catch (error) {
      this.updateState((state) => ({ error, loading: false }));
    }
  }
}
```

### 3. Service Layer Separation

#### Current Problems:

- Data operations mixed with UI logic
- No separation of concerns
- Inconsistent error handling

#### Solution: Dedicated Services

```javascript
// services/ScheduleService.js
export class ScheduleService {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.cache = new Map();
  }

  async getSchedule(userId) {
    if (this.cache.has(userId)) {
      return this.cache.get(userId);
    }

    const schedule = await this.dataManager.getUserSchedule(userId);
    const converted = this.convertToStandardFormat(schedule);
    this.cache.set(userId, converted);
    return converted;
  }

  convertToStandardFormat(firestoreData) {
    // Centralized conversion logic
  }
}
```

### 4. Component Separation

#### Current Problems:

- Massive rendering functions
- Mixed rendering and business logic
- No reusable components

#### Solution: Focused Components

```javascript
// components/ScheduleGrid.js
export class ScheduleGrid {
  constructor(container, scheduleState) {
    this.container = container;
    this.scheduleState = scheduleState;
    this.setupEventListeners();
  }

  render() {
    const { users, compareMode, selectedUserIds } =
      this.scheduleState.getState();

    if (compareMode) {
      this.renderComparisonGrid(users, selectedUserIds);
    } else {
      this.renderSingleGrid(users);
    }
  }

  renderComparisonGrid(users, selectedUserIds) {
    // Focused comparison rendering
  }
}
```

### 5. Event Handling Improvements

#### Current Problems:

- Event handlers scattered throughout
- No centralized event management
- Complex event propagation

#### Solution: Event Bus Pattern

```javascript
// utils/EventBus.js
export class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(handler);
  }

  emit(event, data) {
    if (this.events.has(event)) {
      this.events.get(event).forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }
}
```

## Implementation Priority

### Phase 1: Extract Core Services (Week 1)

1. Create ScheduleService for data operations
2. Create ComparisonService for comparison logic
3. Extract conversion utilities

### Phase 2: State Management (Week 2)

1. Implement centralized ScheduleState
2. Replace direct state mutations
3. Add state synchronization

### Phase 3: Component Separation (Week 3)

1. Extract ScheduleGrid component
2. Create DayView component
3. Separate comparison components

### Phase 4: Event System (Week 4)

1. Implement EventBus
2. Refactor event handlers
3. Add proper error boundaries

### Phase 5: Testing & Optimization (Week 5)

1. Add unit tests for each service
2. Performance optimizations
3. Code cleanup

## Benefits After Refactoring

### Maintainability

- Each file has single responsibility
- Easy to locate and fix bugs
- New features can be added without affecting others

### Testing

- Each service can be unit tested
- Mock dependencies easily
- Better test coverage

### Performance

- Lazy loading of components
- Better caching strategies
- Reduced re-renders

### Developer Experience

- Easier onboarding for new developers
- Better code navigation
- Clearer data flow

## Code Quality Metrics Improvement

| Metric                | Before    | After      |
| --------------------- | --------- | ---------- |
| Lines per file        | 5,174     | <500       |
| Cyclomatic complexity | Very High | Low-Medium |
| Coupling              | Tight     | Loose      |
| Cohesion              | Low       | High       |
| Testability           | Poor      | Excellent  |

## Migration Strategy

1. **Incremental Refactoring**: Don't rewrite everything at once
2. **Feature Flags**: Use flags to switch between old/new implementations
3. **Backward Compatibility**: Ensure existing functionality works
4. **Testing**: Add tests before refactoring each piece
5. **Documentation**: Document each service and component

This refactoring will transform your monolithic file into a maintainable, scalable architecture.
