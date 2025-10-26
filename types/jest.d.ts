// Jest type declarations for test files
// This file provides type definitions for Jest globals when Jest is not configured

declare global {
  function describe(name: string, fn: () => void | Promise<void>): void;
  function it(name: string, fn: () => void | Promise<void>): void;
  function beforeEach(fn: () => void | Promise<void>): void;
  function afterEach(fn: () => void | Promise<void>): void;
  function beforeAll(fn: () => void | Promise<void>): void;
  function afterAll(fn: () => void | Promise<void>): void;
  
  const jest: {
    mock: (moduleName: string, factory?: () => any) => void;
    spyOn: <T extends {}, M extends keyof T>(object: T, method: M) => MockInstance<T[M]>;
    fn: <T extends (...args: any[]) => any>(implementation?: T) => MockInstance<T>;
    clearAllMocks: () => void;
    resetAllMocks: () => void;
    restoreAllMocks: () => void;
  };
  
  interface MockInstance<T = any> {
    mockReturnValue: (value: any) => MockInstance<T>;
    mockResolvedValue: (value: any) => MockInstance<T>;
    mockRejectedValue: (value: any) => MockInstance<T>;
    mockImplementation: (fn: T) => MockInstance<T>;
    mockClear: () => MockInstance<T>;
    mockReset: () => MockInstance<T>;
    mockRestore: () => void;
  }
  
  function expect(actual: any): Matchers<any>;
  
  interface Matchers<T> {
    toBe(expected: T): void;
    toEqual(expected: T): void;
    toStrictEqual(expected: T): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toContain(expected: any): void;
    toContainEqual(expected: any): void;
    toHaveLength(expected: number): void;
    toHaveProperty(keyPath: string, value?: any): void;
    toThrow(expected?: string | RegExp | Error): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(expected: number): void;
    toHaveBeenCalledWith(...args: any[]): void;
    toHaveBeenLastCalledWith(...args: any[]): void;
    toHaveBeenNthCalledWith(nthCall: number, ...args: any[]): void;
    toHaveReturnedWith(expected: any): void;
    toMatchObject(expected: any): void;
    toMatch(expected: string | RegExp): void;
    not: Matchers<T>;
  }
  
  namespace expect {
    function objectContaining(sample: Record<string, any>): any;
    function arrayContaining(sample: any[]): any;
    function stringContaining(sample: string): any;
    function stringMatching(sample: string | RegExp): any;
    function any(constructor: any): any;
    function anything(): any;
  }
}

export {};