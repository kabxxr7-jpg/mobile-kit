import AcmeKit

/// A tiny library that uses the fixture dependency, so a successful build proves the
/// dependency really was resolved, fetched, compiled and linked.
public enum LabKit {
    public static func banner() -> String {
        "LabKit says: " + acmeGreeting()
    }
}
