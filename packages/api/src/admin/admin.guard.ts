import { type CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { isDeployed } from '../auth.js';

/**
 * L'admin écrit dans les 9 tables : il ne tourne qu'en LOCAL.
 *
 * Une fois déployé, `AppModule` ne monte même pas le module admin. Cette garde est la
 * seconde ceinture : si le module venait à être monté par erreur, la route répondrait
 * quand même 404, comme si elle n'existait pas.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(): boolean {
    if (isDeployed()) throw new NotFoundException();
    return true;
  }
}
