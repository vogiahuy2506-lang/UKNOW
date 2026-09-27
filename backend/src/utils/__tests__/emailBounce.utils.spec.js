import { describe, it, expect } from '@jest/globals';
import { isSmtpAuthConfigError, isSmtpPreSendTransientError } from '../emailBounce.utils.js';

/**
 * PR-6 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) — mỗi ca là một mẫu lỗi SMTP thật đo được trên
 * production 60 ngày (~137 lỗi trước DATA bị xử lý sai thành lỗi vĩnh viễn/cấu hình).
 */
describe('isSmtpPreSendTransientError — mẫu lỗi thật production, chắc chắn trước DATA', () => {
  it('Invalid greeting…too many connections (421) → transient', () => {
    const error = { message: 'Invalid greeting. response=421 4.7.0 too many connections', responseCode: 421, command: 'CONN' };
    expect(isSmtpPreSendTransientError(error)).toBe(true);
  });

  it('Greeting never received → transient (dù không có responseCode)', () => {
    const error = { message: 'Greeting never received', code: 'ETIMEDOUT', command: 'CONN' };
    expect(isSmtpPreSendTransientError(error)).toBe(true);
  });

  it('Connection timeout (timeout LÚC KẾT NỐI) → transient', () => {
    const error = { message: 'Connection timeout', code: 'ETIMEDOUT', command: 'CONN' };
    expect(isSmtpPreSendTransientError(error)).toBe(true);
  });

  it('SSL routines … handshake failure → transient', () => {
    const error = { message: 'error:1417C0C7:SSL routines:tls_process_client_hello:unsupported protocol handshake failure' };
    expect(isSmtpPreSendTransientError(error)).toBe(true);
  });

  it('error.code === ETLS (STARTTLS upgrade bị đứt) → transient', () => {
    const error = { message: 'Connection closed unexpectedly', code: 'ETLS', command: 'CONN' };
    expect(isSmtpPreSendTransientError(error)).toBe(true);
  });

  it('Invalid login: 454 4.7.0 Temporary authentication failure → transient TRUE, isSmtpAuthConfigError FALSE', () => {
    const error = { message: 'Invalid login: 454 4.7.0 Temporary authentication failure', responseCode: 454, command: 'AUTH PLAIN' };
    expect(isSmtpPreSendTransientError(error)).toBe(true);
    expect(isSmtpAuthConfigError(error)).toBe(false);
  });

  it('Mail command failed: 421 Reached maximum number of messages sent per connection → transient', () => {
    const error = { message: 'Mail command failed: 421 Reached maximum number of messages sent per connection', responseCode: 421, command: 'MAIL FROM' };
    expect(isSmtpPreSendTransientError(error)).toBe(true);
  });

  it('421/450/451/452/454 ở RCPT TO/EHLO/STARTTLS cũng transient (đủ bộ lệnh trước DATA)', () => {
    for (const command of ['EHLO', 'HELO', 'LHLO', 'STARTTLS', 'RCPT TO']) {
      expect(isSmtpPreSendTransientError({ message: 'temp error', responseCode: 450, command })).toBe(true);
    }
  });

  it('4xx nhưng command là DATA (đã qua DATA) → KHÔNG transient', () => {
    const error = { message: 'temp error', responseCode: 452, command: 'DATA' };
    expect(isSmtpPreSendTransientError(error)).toBe(false);
  });
});

describe('isSmtpPreSendTransientError — nhóm mơ hồ, KHÔNG được coi là transient (giữ uncertain)', () => {
  it('read ECONNRESET (mơ hồ đo được trên prod) → transient false', () => {
    const error = { message: 'read ECONNRESET', code: 'ESOCKET', command: 'CONN' };
    expect(isSmtpPreSendTransientError(error)).toBe(false);
  });

  it('Timeout trần (socket idle giữa DATA, KHÁC "Connection timeout") → transient false', () => {
    const error = { message: 'Timeout', code: 'ETIMEDOUT', command: 'CONN' };
    expect(isSmtpPreSendTransientError(error)).toBe(false);
  });

  it('connection closed (ECONNECTION, có thể đứt giữa DATA) → transient false', () => {
    const error = { message: 'Connection closed unexpectedly', code: 'ECONNECTION', command: 'CONN' };
    expect(isSmtpPreSendTransientError(error)).toBe(false);
  });

  it('socket hang up → transient false', () => {
    const error = { message: 'socket hang up', code: 'ECONNRESET', command: 'CONN' };
    expect(isSmtpPreSendTransientError(error)).toBe(false);
  });

  it('message/error rỗng hoặc thiếu → transient false', () => {
    expect(isSmtpPreSendTransientError({})).toBe(false);
    expect(isSmtpPreSendTransientError(null)).toBe(false);
    expect(isSmtpPreSendTransientError(undefined)).toBe(false);
  });
});

describe('isSmtpAuthConfigError — 454 KHÔNG còn là lỗi cấu hình, 535 vẫn là', () => {
  it('535 vẫn là lỗi cấu hình (không đổi hành vi cũ)', () => {
    const error = { message: 'Invalid login: 535 5.7.8 Username and Password not accepted', responseCode: 535, command: 'AUTH PLAIN' };
    expect(isSmtpAuthConfigError(error)).toBe(true);
  });

  it('454 (dù message chứa "invalid login") → KHÔNG phải lỗi cấu hình', () => {
    const error = { message: 'Invalid login: 454 4.7.0 Temporary authentication failure', responseCode: 454 };
    expect(isSmtpAuthConfigError(error)).toBe(false);
  });
});
