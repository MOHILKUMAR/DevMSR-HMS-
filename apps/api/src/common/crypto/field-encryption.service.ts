import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import {
  createFieldCipher,
  type FieldCipher,
  type HashedField,
  type ProtectedField,
  type ProtectedValue,
  type SealedField,
} from './field-encryption.js';

/** Field-level encryption for Aadhaar and ABHA numbers and two-factor secrets, keyed by FIELD_ENCRYPTION_KEY. */
@Injectable()
export class FieldEncryptionService {
  private readonly cipher: FieldCipher;

  constructor(@Inject(ENV) env: Env) {
    this.cipher = createFieldCipher(env.FIELD_ENCRYPTION_KEY);
  }

  protect(field: ProtectedField, value: string): ProtectedValue {
    return this.cipher.protect(field, value);
  }

  reveal(field: ProtectedField, encrypted: string): string {
    return this.cipher.reveal(field, encrypted);
  }

  blindIndex(field: ProtectedField, value: string): string {
    return this.cipher.blindIndex(field, value);
  }

  seal(field: SealedField, value: string): string {
    return this.cipher.seal(field, value);
  }

  open(field: SealedField, sealed: string): string {
    return this.cipher.open(field, sealed);
  }

  keyedHash(field: HashedField, value: string): string {
    return this.cipher.keyedHash(field, value);
  }
}
