import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateConversationDto {
  @IsOptional() @IsString() @MaxLength(80) title?: string;
}

export class SendAssistantMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) content!: string;
}

