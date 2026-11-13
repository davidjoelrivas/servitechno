import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type AssistantMessage } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.assistantConversation.findMany({
      where: { userId, archived: false },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        proposals: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
    });
  }

  create(userId: string, title?: string) {
    return this.prisma.assistantConversation.create({
      data: { userId, title: title?.trim() || "Nueva conversación" },
    });
  }

  async getOwned(id: string, userId: string) {
    const conversation = await this.prisma.assistantConversation.findFirst({
      where: { id, userId, archived: false },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 100 },
        proposals: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!conversation) throw new NotFoundException("Conversación no encontrada");
    return conversation;
  }

  async turns(id: string, userId: string) {
    const conversation = await this.getOwned(id, userId);
    return conversation.messages.slice(-16).map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  async addMessage(
    conversationId: string,
    userId: string,
    role: "USER" | "ASSISTANT",
    content: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<AssistantMessage> {
    const conversation = await this.getOwned(conversationId, userId);
    const now = new Date();
    const title =
      role === "USER" && conversation.messages.length === 0
        ? content.trim().slice(0, 70)
        : undefined;
    const [, message] = await this.prisma.$transaction([
      this.prisma.assistantConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now, ...(title ? { title } : {}) },
      }),
      this.prisma.assistantMessage.create({
        data: { conversationId, role, content, metadata },
      }),
    ]);
    return message;
  }
}

