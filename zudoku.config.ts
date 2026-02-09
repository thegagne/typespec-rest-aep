import type { ZudokuConfig } from "zudoku";

const config: ZudokuConfig = {
  apis: {
    type: "file",
    input: "./tsp-output/@typespec/openapi3/openapi.json",
    path: "/api",
  },
};

export default config;
