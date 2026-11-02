export const CACHE_KEYSPACES = {
  STUDENTS: 'cr:students:',
  COURSES: 'cr:courses:',
  ASSIGNMENTS: 'cr:assignments:',
  ATTENDANCE: 'cr:attendance:',
  EVENTS: 'cr:events:',
  GROUPS: 'cr:groups:',
  LECTURERS: 'cr:lecturers:',
  NOTIFICATIONS: 'cr:notifications:',
  AUTH: 'cr:auth:',
  AUTH_RESET: 'cr:auth:reset:',
  AUTH_VERIFY: 'cr:auth:verify:',
  AUTH_BLACKLIST: 'cr:auth:blacklist:',
} as const;

export const CACHE_TTL = {
  ONE_MINUTE: 60,
  FIVE_MINUTES: 300,
  FIFTEEN_MINUTES: 900,
  ONE_HOUR: 3600,
  ONE_DAY: 86400,
  SEVEN_DAYS: 604800,
} as const;
