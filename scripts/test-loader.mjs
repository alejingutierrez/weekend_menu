// Run the actual TypeScript server modules with Node's test runner, without a bundler.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      ["next/headers", "next/server", "next/navigation", "next/cache"].includes(
        specifier,
      )
    )
      specifier += ".js";
    if (specifier.startsWith("@/"))
      specifier = pathToFileURL(
        fileURLToPath(new URL("../" + specifier.slice(2), import.meta.url)),
      ).href;
    if (
      (specifier.startsWith(".") || specifier.startsWith("file:")) &&
      context.parentURL
    ) {
      const resolved = new URL(specifier, context.parentURL);
      if (!existsSync(resolved) && existsSync(fileURLToPath(resolved) + ".ts"))
        return nextResolve(resolved.href + ".ts", context);
    }
    return nextResolve(specifier, context);
  },
});
