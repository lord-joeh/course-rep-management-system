export interface JwtPayload {
  sub: string;
  email: string;
  isRep: boolean;
  role: 'REP' | 'STUDENT' | 'ADMIN';
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  isRep: boolean;
  role: 'REP' | 'STUDENT' | 'ADMIN';
  status: string;
}
