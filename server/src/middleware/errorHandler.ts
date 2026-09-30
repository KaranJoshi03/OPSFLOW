import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number, code: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'AppError';
  }
}

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error(`[Error] ${err.message}`, err.stack);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
    return;
  }

  // Prisma errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      res.status(409).json({
        error: 'A record with this value already exists',
        code: 'DUPLICATE_ENTRY',
        field: prismaErr.meta?.target,
      });
      return;
    }
    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        error: 'Record not found',
        code: 'NOT_FOUND',
      });
      return;
    }
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: (err as any).errors,
    });
    return;
  }

  // Default error
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
};
