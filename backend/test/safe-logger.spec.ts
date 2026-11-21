import { SafeLogger } from '../src/common/safe-logger';

describe('SafeLogger redaction', () => {
  let output = '';
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    output = '';
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output += chunk.toString();
      return true;
    }) as typeof process.stdout.write);
  });

  afterEach(() => writeSpy.mockRestore());

  it('redacts sensitive payload paths and signed URL query secrets before output', () => {
    const password = 'very-secret-password';
    const signature = 'very-secret-signature';
    const logger = new SafeLogger();

    logger.log({
      password,
      nested: {
        signedUrl: `https://storage.example/ticket?X-Amz-Signature=${signature}`,
      },
    });

    expect(output).not.toContain(password);
    expect(output).not.toContain(signature);
    expect(output).not.toContain('X-Amz-Signature');
    expect(output).toContain('[REDACTED]');
  });
});
