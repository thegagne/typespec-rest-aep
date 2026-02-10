import type { ZudokuConfig } from "zudoku";

const config: ZudokuConfig = {
  apis: {
    type: "file",
    input: "./example-output/@typespec/openapi3/openapi.json",
    path: "/",
    options: {
      expandApiInformation: false, // Control if API information section is expanded
      schemaDownload: { enabled: true }, // Enable schema download button
    }
  },
};

export default config;
