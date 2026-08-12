// Text-level version rewrites. String surgery instead of parse/serialize so
// untouched lines keep their exact formatting (Cargo.lock is machine-written;
// a wholesale re-serialize would make the diff unreviewable).
export const bumpJson = (text, version) =>
  text.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`)

// [package] is the first table in our Cargo.toml, so the first `version =`
// line is the package's own — dependency tables use inline `{ version = … }`
// which the ^-anchored multiline regex never touches.
export const bumpCargoToml = (text, version) =>
  text.replace(/^(version\s*=\s*")[^"]+(")/m, `$1${version}$2`)

export const bumpCargoLock = (text, version) =>
  text.replace(/(\[\[package\]\]\nname = "swarmterm"\nversion = ")[^"]+(")/, `$1${version}$2`)
