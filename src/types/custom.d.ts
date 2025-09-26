declare module 'papaparse' {
  interface ParseResult<T> {
    data: T[];
    errors: Array<{ message: string }>;
    meta: Record<string, unknown>;
  }

  interface ParseConfig {
    header?: boolean;
  }

  interface PapaParse {
    parse<T = Record<string, string | number | null | undefined>>(
      csvString: string,
      config?: ParseConfig
    ): ParseResult<T>;
  }

  const Papa: PapaParse;
  export default Papa;
}

declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (databaseFile?: Uint8Array) => Database;
  }

  export interface Statement {
    bind(values: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    run(values?: unknown[]): void;
    free(): void;
  }

  export interface Database {
    prepare(sql: string): Statement;
    run(sql: string): void;
    export(): Uint8Array;
    exec(
      sql: string
    ): Array<{ columns: string[]; values: Array<Array<unknown>> }>;
  }

  interface InitConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: InitConfig): Promise<SqlJsStatic>;
}
