import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Token requerido');

    const { data, error } = await this.supabase.client.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Token inválido');

    req.user = data.user;
    return true;
  }
}