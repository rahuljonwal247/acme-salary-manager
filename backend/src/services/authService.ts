import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import type { Actor, Role, User } from '../domain/types';
import type { UserRepository } from '../repositories/types';

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this') {
    super(message, 403, 'FORBIDDEN');
  }
}

const BCRYPT_ROUNDS = 10;
/** Compared against when the user doesn't exist, so response time doesn't reveal valid emails. */
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Password policy: ≥ 10 chars with a letter and a digit. */
export function assertStrongPassword(password: string): void {
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ValidationError('Password must be at least 10 characters and include a letter and a number');
  }
}

interface TokenClaims {
  sub: string;
  role: Role;
  name: string;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly secret: string,
    private readonly ttl: string = '8h',
  ) {}

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    // One generic message for every failure mode — no account enumeration.
    if (!user || !ok || !user.isActive) throw new UnauthorizedError('Invalid email or password');

    await this.users.recordLogin(user.id);
    const { passwordHash: _secret, ...safe } = user;
    const claims: TokenClaims = { sub: String(user.id), role: user.role, name: user.name };
    const token = jwt.sign(claims, this.secret, { expiresIn: this.ttl as jwt.SignOptions['expiresIn'] });
    return { token, user: safe };
  }

  /**
   * Verifies the token AND re-reads the user, so deactivating a user or changing their role takes
   * effect on their very next request rather than when the token expires.
   */
  async authenticate(token: string | undefined): Promise<Actor> {
    if (!token) throw new UnauthorizedError();
    let claims: TokenClaims;
    try {
      claims = jwt.verify(token, this.secret) as TokenClaims;
    } catch {
      throw new UnauthorizedError('Session expired or invalid — please sign in again');
    }
    const user = await this.users.findById(Number(claims.sub));
    if (!user || !user.isActive) throw new UnauthorizedError('Account is disabled');
    return { id: user.id, name: user.name, role: user.role };
  }
}

export class UserService {
  constructor(private readonly users: UserRepository) {}

  list(): Promise<User[]> {
    return this.users.list();
  }

  async me(id: number): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  async create(input: { email: string; name: string; role: Role; password: string }, actor: Actor): Promise<User> {
    const email = input.email.trim().toLowerCase();
    assertStrongPassword(input.password);
    if (await this.users.findByEmail(email)) throw new ConflictError(`A user with email ${email} already exists`);
    return this.users.create(
      { email, name: input.name.trim(), role: input.role, passwordHash: await hashPassword(input.password) },
      { userId: actor.id, action: 'USER_CREATED', entityType: 'USER', entityId: null, details: { email, role: input.role } },
    );
  }

  async update(
    id: number,
    patch: Partial<{ name: string; role: Role; isActive: boolean; password: string }>,
    actor: Actor,
  ): Promise<User> {
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundError(`User ${id} not found`);
    // Lock-out protection: an admin cannot demote or disable themselves.
    if (id === actor.id && (patch.isActive === false || (patch.role && patch.role !== 'ADMIN'))) {
      throw new ValidationError('You cannot disable your own account or remove your own admin role');
    }
    const { password, ...rest } = patch;
    if (password !== undefined) assertStrongPassword(password);
    const details: Record<string, unknown> = { ...rest };
    if (password !== undefined) details.passwordReset = true;
    return this.users.update(
      id,
      { ...rest, ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}) },
      { userId: actor.id, action: 'USER_UPDATED', entityType: 'USER', entityId: id, details },
    );
  }
}
