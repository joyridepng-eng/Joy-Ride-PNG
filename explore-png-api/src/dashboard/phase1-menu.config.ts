export type DashboardModuleStatus = 'ACTIVE' | 'COMING_SOON' | 'HIDDEN';

export type DashboardModuleConfig = {
  key: string;
  label: string;
  status: DashboardModuleStatus;
  route?: string;
  group: 'JOY_RIDE' | 'OPERATIONS' | 'TOURISM_FUTURE';
};

export const phase1DashboardModules: DashboardModuleConfig[] = [
  {
    key: 'joy_ride_city',
    label: 'Joy Ride City',
    status: 'ACTIVE',
    route: '/admin/joy-ride/city',
    group: 'JOY_RIDE',
  },
  {
    key: 'joy_ride_airport',
    label: 'Joy Ride Airport',
    status: 'ACTIVE',
    route: '/admin/joy-ride/airport',
    group: 'JOY_RIDE',
  },
  {
    key: 'joy_ride_hotel',
    label: 'Joy Ride Hotel',
    status: 'ACTIVE',
    route: '/admin/joy-ride/hotel',
    group: 'JOY_RIDE',
  },
  {
    key: 'joy_ride_schedule',
    label: 'Joy Ride Schedule',
    status: 'ACTIVE',
    route: '/admin/joy-ride/scheduled',
    group: 'JOY_RIDE',
  },
  {
    key: 'joy_ride_group',
    label: 'Joy Ride Group',
    status: 'ACTIVE',
    route: '/admin/joy-ride/group',
    group: 'JOY_RIDE',
  },

  {
    key: 'drivers',
    label: 'Drivers',
    status: 'ACTIVE',
    route: '/admin/drivers',
    group: 'OPERATIONS',
  },
  {
    key: 'vehicles',
    label: 'Vehicles',
    status: 'ACTIVE',
    route: '/admin/vehicles',
    group: 'OPERATIONS',
  },
  {
    key: 'live_trips',
    label: 'Live trips',
    status: 'ACTIVE',
    route: '/admin/live-trips',
    group: 'OPERATIONS',
  },
  {
    key: 'completed_trips',
    label: 'Completed trips',
    status: 'ACTIVE',
    route: '/admin/completed-trips',
    group: 'OPERATIONS',
  },
  {
    key: 'fare_estimates',
    label: 'Fare estimates',
    status: 'ACTIVE',
    route: '/admin/fares',
    group: 'OPERATIONS',
  },
  {
    key: 'complaints_support',
    label: 'Complaints / support',
    status: 'ACTIVE',
    route: '/admin/support',
    group: 'OPERATIONS',
  },
  {
    key: 'reports',
    label: 'Reports',
    status: 'ACTIVE',
    route: '/admin/reports',
    group: 'OPERATIONS',
  },

  {
    key: 'destinations',
    label: 'Destinations',
    status: 'COMING_SOON',
    group: 'TOURISM_FUTURE',
  },
  {
    key: 'tours',
    label: 'Tours & Experiences',
    status: 'COMING_SOON',
    group: 'TOURISM_FUTURE',
  },
  {
    key: 'accommodation',
    label: 'Accommodation',
    status: 'COMING_SOON',
    group: 'TOURISM_FUTURE',
  },
  {
    key: 'culture',
    label: 'Culture',
    status: 'COMING_SOON',
    group: 'TOURISM_FUTURE',
  },
  {
    key: 'coffee_tours',
    label: 'Coffee tours',
    status: 'COMING_SOON',
    group: 'TOURISM_FUTURE',
  },
  {
    key: 'events',
    label: 'Events',
    status: 'COMING_SOON',
    group: 'TOURISM_FUTURE',
  },
];

export function getVisiblePhase1DashboardModules() {
  return phase1DashboardModules.filter((module) => module.status !== 'HIDDEN');
}

export function getActivePhase1DashboardModules() {
  return phase1DashboardModules.filter((module) => module.status === 'ACTIVE');
}
