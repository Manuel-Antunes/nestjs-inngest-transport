import { InngestRecordBuilder } from './inngest-record.builder';

describe('InngestRecordBuilder', () => {
  it('marks what it builds, and nothing else', () => {
    const record = new InngestRecordBuilder({ id: 1 }).build();

    expect(InngestRecordBuilder.isRecord(record)).toBe(true);
    expect(InngestRecordBuilder.isRecord({ data: 1, options: {} })).toBe(false);
    expect(InngestRecordBuilder.isRecord(null)).toBe(false);
  });

  it('merges every setter into one set of options', () => {
    const date = new Date(0);
    const { options } = new InngestRecordBuilder({})
      .setUser({ a: '1' })
      .setUser({ b: '2' })
      .setMetadata({ tenant: 'acme' })
      .setSession('conversation_id', 'c-1')
      .setSessions({ run: 2 })
      .setIdempotencyKey('k')
      .setTimestamp(date)
      .build();

    expect(options).toEqual({
      user: { a: '1', b: '2' },
      metadata: { tenant: 'acme' },
      sessions: { conversation_id: 'c-1', run: 2 },
      idempotencyKey: 'k',
      ts: date,
    });
  });

  it('refuses more sessions than Inngest takes, instead of letting the send fail later', () => {
    const builder = new InngestRecordBuilder({});
    const sessions = Object.fromEntries(
      Array.from({ length: InngestRecordBuilder.MAX_SESSIONS + 1 }, (_, i) => [
        `s${i}`,
        i,
      ]),
    );

    expect(() => builder.setSessions(sessions)).toThrow(/at most 5 sessions/);
    expect(InngestRecordBuilder.sessionsRefusal('x', { a: 1 })).toBeUndefined();
  });
});
