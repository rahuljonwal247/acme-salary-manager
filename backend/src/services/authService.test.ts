import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../domain/errors';
import { InMemoryUserRepository } from '../testing/fakes';
import { assertStrongPassword, AuthService, UnauthorizedError, UserService } from './authService';

const SECRET = 'test-secret-that-is-long-enough-123456';

describe('AuthService', () => {
  let users: InMemoryUserRepository;
  let auth: AuthService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    users.seed({ email: 'hr@acme.example', name: 'Harper', role: 'HR_MANAGER', password: 'CorrectHorse1' });
    users.seed({ email: 'gone@acme.example', name: 'Gone', role: 'HR_MANAGER', password: 'CorrectHorse1', isActive: false });
    auth = new AuthService(users, SECRET, '1h');
  });

  it('issues a signed token and returns the user without the hash', async () => {
    const { token, user } = await auth.login('  HR@acme.example ', 'CorrectHorse1');
    expect(user).toMatchObject({ email: 'hr@acme.example', role: 'HR_MANAGER' });
    expect(user).not.toHaveProperty('passwordHash');
    expect(jwt.verify(token, SECRET)).toMatchObject({ sub: '1', role: 'HR_MANAGER' });
    expect(users.logins).toEqual([1]);
  });

  it.each([
    ['wrong password', 'hr@acme.example', 'nope'],
    ['unknown email', 'who@acme.example', 'CorrectHorse1'],
    ['disabled account', 'gone@acme.example', 'CorrectHorse1'],
  ])('rejects %s with one generic message', async (_case, email, password) => {
    await expect(auth.login(email, password)).rejects.toThrow('Invalid email or password');
  });

  it('authenticates a valid token into an actor', async () => {
    const { token } = await auth.login('hr@acme.example', 'CorrectHorse1');
    await expect(auth.authenticate(token)).resolves.toEqual({ id: 1, name: 'Harper', role: 'HR_MANAGER' });
  });

  it('rejects missing, tampered and expired tokens', async () => {
    await expect(auth.authenticate(undefined)).rejects.toThrow(UnauthorizedError);
    const forged = jwt.sign({ sub: '1', role: 'ADMIN' }, 'some-other-secret-value-xxxxxxxxxxxx');
    await expect(auth.authenticate(forged)).rejects.toThrow(/expired or invalid/);
    const expired = jwt.sign({ sub: '1', role: 'HR_MANAGER' }, SECRET, { expiresIn: -10 });
    await expect(auth.authenticate(expired)).rejects.toThrow(/expired or invalid/);
  });

  it('takes the role from the database, not the token, and locks out disabled users immediately', async () => {
    const { token } = await auth.login('hr@acme.example', 'CorrectHorse1');
    await users.update(1, { role: 'ADMIN' }, { userId: 1, action: 'USER_UPDATED', entityType: 'USER', entityId: 1 });
    expect((await auth.authenticate(token)).role).toBe('ADMIN');
    await users.update(1, { isActive: false }, { userId: 1, action: 'USER_UPDATED', entityType: 'USER', entityId: 1 });
    await expect(auth.authenticate(token)).rejects.toThrow(/disabled/);
  });
});

describe('UserService', () => {
  const admin = { id: 1, name: 'Avery', role: 'ADMIN' as const };
  let users: InMemoryUserRepository;
  let service: UserService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    users.seed({ email: 'admin@acme.example', name: 'Avery', role: 'ADMIN', password: 'AdminPass123' });
    service = new UserService(users);
  });

  it('creates a user with a hashed password and audits it', async () => {
    const created = await service.create(
      { email: 'New@Acme.example', name: ' Nia ', role: 'HR_MANAGER', password: 'Str0ngPassword' },
      admin,
    );
    expect(created).toMatchObject({ email: 'new@acme.example', name: 'Nia', role: 'HR_MANAGER', isActive: true });
    expect(users.hashOf(created.id)).toMatch(/^\$2[aby]\$/);
    expect(users.audit.entries.at(-1)).toMatchObject({ action: 'USER_CREATED', entityId: created.id, userId: 1 });
  });

  it('rejects weak passwords and duplicate emails', async () => {
    await expect(
      service.create({ email: 'x@acme.example', name: 'X', role: 'HR_MANAGER', password: 'short1' }, admin),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.create({ email: 'admin@acme.example', name: 'X', role: 'ADMIN', password: 'LongEnough123' }, admin),
    ).rejects.toThrow(ConflictError);
  });

  it('prevents an admin from locking themselves out', async () => {
    await expect(service.update(1, { isActive: false }, admin)).rejects.toThrow(/your own/);
    await expect(service.update(1, { role: 'HR_MANAGER' }, admin)).rejects.toThrow(/your own/);
  });

  it('resets a password without writing it to the audit log', async () => {
    const created = await service.create(
      { email: 'b@acme.example', name: 'B', role: 'HR_MANAGER', password: 'Str0ngPassword' },
      admin,
    );
    const before = users.hashOf(created.id);
    await service.update(created.id, { password: 'An0therPassword' }, admin);
    expect(users.hashOf(created.id)).not.toBe(before);
    expect(JSON.stringify(users.audit.entries.at(-1))).not.toContain('An0therPassword');
    expect(users.audit.entries.at(-1)?.details).toEqual({ passwordReset: true });
  });
});

describe('assertStrongPassword', () => {
  it.each(['short1', 'longbutnodigits', '1234567890123'])('rejects %s', (p) => {
    expect(() => assertStrongPassword(p)).toThrow();
  });
  it('accepts 10+ chars with letters and digits', () => {
    expect(() => assertStrongPassword('abcdefghi1')).not.toThrow();
  });
});
