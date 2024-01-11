import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import { Threads } from 'openai/resources/beta';
import MessageContentText = Threads.MessageContentText;

@Injectable()
export class TelegramService {
  private bot: TelegramBot;
  private openai: OpenAI;
  private assistantId: string;
  private openaiThreads: Record<number, string> = {};

  constructor(private readonly configService: ConfigService) {
    const telegramToken = configService.get('telegram.token');
    this.bot = new TelegramBot(telegramToken, { polling: true });

    this.openai = new OpenAI({
      apiKey: configService.get('openai.apiKey'),
    });

    this.assistantId = configService.get('openai.assistantId');

    this.initBot();
  }

  async initBot() {
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      console.log('chatId', chatId);

      const text = msg.text;

      console.log(`msg from ${msg?.chat?.username}:`, text);

      switch (text) {
        case '/start':
          this.bot.sendMessage(
            chatId,
            `Здравствуйте @${msg?.chat?.username}!\nМеня зовут Андрэ, если хотите чтобы я загадал новую загадку, просто напишите команду /new`,
          );
          break;
        case '/new':
          await this.createThread(chatId);
          await this.openai.beta.threads.messages.create(
            this.openaiThreads[chatId],
            {
              role: 'user',
              content: `Загадай новую загадку`,
            },
          );

          const answerNew = await this.threadRun(chatId);

          this.bot.sendMessage(chatId, answerNew);
          break;
        default:
          await this.openai.beta.threads.messages.create(
            this.openaiThreads[chatId],
            {
              role: 'user',
              content: text,
            },
          );

          const answer = await this.threadRun(chatId);

          this.bot.sendMessage(chatId, answer);
      }
    });
  }

  async createThread(chatId: number) {
    const thread = await this.openai.beta.threads.create();
    this.openaiThreads[chatId] = thread.id;
  }

  private delay(ms = 1000) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async threadRun(chatId: number): Promise<string> {
    const run = await this.openai.beta.threads.runs.create(
      this.openaiThreads[chatId],
      {
        assistant_id: this.assistantId,
      },
    );

    let retrieve = await this.openai.beta.threads.runs.retrieve(
      this.openaiThreads[chatId],
      run.id,
    );

    for (let i = 0; i < 15; i++) {
      await this.delay(5000);

      const statuses = ['failed', 'completed', 'expired'];

      if (statuses.includes(retrieve.status)) {
        break;
      } else {
        console.log('check', i);
        retrieve = await this.openai.beta.threads.runs.retrieve(
          this.openaiThreads[chatId],
          run.id,
        );
      }
    }

    const messages = await this.openai.beta.threads.messages.list(
      this.openaiThreads[chatId],
    );

    const content = messages.data[0].content[0];

    const answer = (content as MessageContentText)?.text?.value;

    return answer;
  }
}
