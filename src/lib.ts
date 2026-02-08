import { createTypeSpecLibrary } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "@typespec-rest-aep/core",
  diagnostics: {
    "aep-resource-requires-key": {
      severity: "error",
      messages: {
        default: "AEP resource must have a property decorated with @key.",
      },
    },
    "aep-resource-requires-path": {
      severity: "warning",
      messages: {
        default:
          "AEP resource should have a 'path' property of type string per AEP-0004.",
      },
    },
  },
  state: {
    aepResource: { description: "State for the @aepResource decorator." },
  },
});

export const { reportDiagnostic, createDiagnostic } = $lib;
