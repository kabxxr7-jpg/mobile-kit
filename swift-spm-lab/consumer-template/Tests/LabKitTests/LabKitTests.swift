import XCTest
@testable import LabKit

final class LabKitTests: XCTestCase {
    func testBannerComesFromTheDependency() {
        XCTAssertEqual(LabKit.banner(), "LabKit says: hello from AcmeKit")
    }
}
