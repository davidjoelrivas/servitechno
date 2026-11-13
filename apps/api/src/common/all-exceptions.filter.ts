import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : "Error interno del servidor";
    if (status >= 500) this.logger.error(exception);
    const message = typeof body === "string" ? body : (body as { message?: string | string[] }).message ?? body;
    response.status(status).json({ statusCode: status, message, timestamp: new Date().toISOString() });
  }
}

