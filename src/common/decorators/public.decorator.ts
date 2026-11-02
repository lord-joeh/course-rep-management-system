import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Decorator to mark routes as publicly accessible, bypassing global JWT authentication.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

