import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../../app/user/user.service';
import { checkTokenExpiry, extractTokenFromHeader } from '../utils/token.utils';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private jwtService: JwtService,
    private userService: UserService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractTokenFromHeader(request.headers);

    // Force User
    if (process.env.FORCE_GUARD_USER) {
      const testUser = {
        id: '3136aa1a-fec8-11de-a55f-00003925d394',
        telegramId: 'test-telegram-id',
        tonAddress: 'test-ton-wallet',
        evmAddress: 'test-evm-address',
        gold: 100,
        createdBy: 'Seeder',
        updatedBy: 'Seeder',
      };

      let user = await this.prisma.user.findUnique({
        where: { id: testUser.id },
      });

      if (!user) {
        user = await this.prisma.user.create({ data: testUser });
      }

      request['user'] = user;
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });

      checkTokenExpiry(payload);
      this.validatePayload(payload);
      const user = await this.verifyUser(payload);
      request['user'] = user;

      return true;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        this.logger.error(`Token expired: ${error.message}`);
        throw new UnauthorizedException('Token has expired');
      } else {
        this.logger.error(`JWT Verification failed: ${error.message}`);
        throw new UnauthorizedException('Invalid token');
      }
    }
  }

  private validatePayload(payload: any) {
    if (
      !payload.telegramId ||
      !payload.sub ||
      payload.telegramId !== payload.sub
    ) {
      throw new UnauthorizedException('Invalid token payload');
    }
  }

  private async verifyUser(payload: any) {
    const user = await this.userService.findByTelegramId(payload.telegramId);
    if (!user) {
      this.logger.warn(`User not found: ${payload.telegramId}`);
      throw new UnauthorizedException('User not found or invalid');
    }
    return user;
  }
}
