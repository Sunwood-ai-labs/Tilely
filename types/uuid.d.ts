declare module "uuid" {
  export type V4Options = {
    random?: number[];
    rng?: () => number[];
  };

  export function v4(options?: V4Options): string;
}
