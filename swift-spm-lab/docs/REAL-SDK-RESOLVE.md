# Real SDK resolve (optional check)

What this is: `tools/real-sdk-resolve.sh 13.1.1 9.3.0`, run once on 2026-11-01, resolved (did **not** build) the real `firebase-ios-sdk` 13.1.1 and `facebook-ios-sdk` 9.3.0 from github.com with `swift package resolve`, in the same isolated paths as the lab (scratch, cache, config, security and `HOME` inside `swift-spm-lab/.work/`). The tags were the highest plain `x.y.z` tags on the remote that day (Facebook tags carry a `v` prefix, `v9.3.0`; SwiftPM accepts `exact: "9.3.0"`). The consumer asked for the `FirebaseAuth` and `FacebookLogin` products. Everything it created was deleted afterwards.

## Did it reproduce a `Package.swift` error?

**No.** Exit code 0. The word `Package.swift` does not appear in the output, and there are no `error:` or `warning:` lines. This was the expected result: the healthy SDKs resolve fine, so a client's "Package.swift doesn't exist" is a property of their situation (a tag, a path, a cache, a pin; see the scenarios), not of Firebase or Facebook at these versions.

| | |
|---|---|
| Toolchain | Apple Swift 6.4.2 (Xcode 27.2), macOS 27.2 arm64 |
| Wall time | 218 s (network: fast; the machine was busy with other work, so treat it as an upper-ish figure) |
| Packages pinned in `Package.resolved` | 14 |
| Disk used while it existed | scratch 1645 MiB + cache 688 MiB, about 2.3 GiB; free disk went from 55 GiB to 53 GiB, back to 55 GiB after deleting |
| Binary artifacts | 9 downloaded during `resolve` (FirebaseAnalytics, GoogleAppMeasurement, grpc, abseil, FirebaseFirestoreInternal, ...); all downloaded without error. This does **not** test a checksum failure, none occurred |
| Free-disk rule | the script refuses to start at 14 GiB free or less; it was 55 GiB |

## Exact output

The report as written by the script (lab path replaced by `<LAB>`, progress counters removed, durations replaced by `<t>`):

```
firebase-ios-sdk: 13.1.1
facebook-ios-sdk: 9.3.0
toolchain: Apple Swift version 6.4.2 (swiftlang-6.4.2.1.9 clang-2100.4.1.1)
command: swift package resolve   (isolated paths inside .work, HOME overridden)
exit code: 0
wall time: 218s
packages pinned in Package.resolved: 14
disk: scratch 1645 MiB + cache 688 MiB; free 55 GiB before, 53 GiB after
'Package.swift' appears in the output: no; error or warning lines: 0

---- output (lab path replaced by <LAB>; progress counters removed) ----
Fetching https://github.com/firebase/firebase-ios-sdk.git
Fetching https://github.com/facebook/facebook-ios-sdk.git
Fetched https://github.com/facebook/facebook-ios-sdk.git (<t>s)
Fetched https://github.com/firebase/firebase-ios-sdk.git (<t>s)
Computing version for https://github.com/facebook/facebook-ios-sdk.git
Computed https://github.com/facebook/facebook-ios-sdk.git at 9.3.0 (<t>s)
Computing version for https://github.com/firebase/firebase-ios-sdk.git
Computed https://github.com/firebase/firebase-ios-sdk.git at 13.1.1 (<t>s)
Fetching https://github.com/google/app-check.git
Fetching https://github.com/google/GoogleAppMeasurement.git
Fetching https://github.com/google/interop-ios-for-google-sdks.git
Fetching https://github.com/firebase/leveldb.git
Fetching https://github.com/google/grpc-binary.git
Fetching https://github.com/google/GoogleUtilities.git
Fetched https://github.com/google/GoogleAppMeasurement.git (<t>s)
Fetched https://github.com/google/interop-ios-for-google-sdks.git (<t>s)
Fetching https://github.com/firebase/nanopb.git
Fetching https://github.com/google/abseil-cpp-binary.git
Fetched https://github.com/google/app-check.git (<t>s)
Fetching https://github.com/google/GoogleDataTransport.git
Fetched https://github.com/google/GoogleUtilities.git (<t>s)
Fetched https://github.com/google/grpc-binary.git (<t>s)
Fetched https://github.com/firebase/leveldb.git (<t>s)
Fetching https://github.com/google/gtm-session-fetcher.git
Fetching https://github.com/google/promises.git
Fetched https://github.com/google/GoogleDataTransport.git (<t>s)
Fetched https://github.com/google/promises.git (<t>s)
Fetched https://github.com/google/gtm-session-fetcher.git (<t>s)
Fetched https://github.com/firebase/nanopb.git (<t>s)
Fetched https://github.com/google/abseil-cpp-binary.git (<t>s)
Computing version for https://github.com/google/app-check.git
Computed https://github.com/google/app-check.git at 12.0.0 (<t>s)
Computing version for https://github.com/google/interop-ios-for-google-sdks.git
Computed https://github.com/google/interop-ios-for-google-sdks.git at 101.0.0 (<t>s)
Computing version for https://github.com/firebase/leveldb.git
Computed https://github.com/firebase/leveldb.git at 1.22.5 (<t>s)
Computing version for https://github.com/google/grpc-binary.git
Computed https://github.com/google/grpc-binary.git at 1.83.1 (<t>s)
Computing version for https://github.com/google/abseil-cpp-binary.git
Computed https://github.com/google/abseil-cpp-binary.git at 1.2025051202.0 (<t>s)
Computing version for https://github.com/firebase/nanopb.git
Computed https://github.com/firebase/nanopb.git at 2.30910.1 (<t>s)
Computing version for https://github.com/google/GoogleDataTransport.git
Computed https://github.com/google/GoogleDataTransport.git at 10.1.1 (<t>s)
Computing version for https://github.com/google/GoogleAppMeasurement.git
Computed https://github.com/google/GoogleAppMeasurement.git at 13.0.1 (<t>s)
Fetching https://github.com/googleads/google-ads-on-device-conversion-ios-sdk
Fetched https://github.com/googleads/google-ads-on-device-conversion-ios-sdk (<t>s)
Computing version for https://github.com/google/promises.git
Computed https://github.com/google/promises.git at 2.4.1 (<t>s)
Computing version for https://github.com/googleads/google-ads-on-device-conversion-ios-sdk
Computed https://github.com/googleads/google-ads-on-device-conversion-ios-sdk at 3.7.0 (<t>s)
Computing version for https://github.com/google/GoogleUtilities.git
Computed https://github.com/google/GoogleUtilities.git at 8.1.5 (<t>s)
Computing version for https://github.com/google/gtm-session-fetcher.git
Computed https://github.com/google/gtm-session-fetcher.git at 5.3.1 (<t>s)
Creating working copy for https://github.com/google/gtm-session-fetcher.git
Working copy of https://github.com/google/gtm-session-fetcher.git resolved at 5.3.1
Creating working copy for https://github.com/firebase/firebase-ios-sdk.git
Working copy of https://github.com/firebase/firebase-ios-sdk.git resolved at 13.1.1
Creating working copy for https://github.com/firebase/nanopb.git
Working copy of https://github.com/firebase/nanopb.git resolved at 2.30910.1
Creating working copy for https://github.com/google/promises.git
Working copy of https://github.com/google/promises.git resolved at 2.4.1
Creating working copy for https://github.com/google/abseil-cpp-binary.git
Working copy of https://github.com/google/abseil-cpp-binary.git resolved at 1.2025051202.0
Creating working copy for https://github.com/firebase/leveldb.git
Working copy of https://github.com/firebase/leveldb.git resolved at 1.22.5
Creating working copy for https://github.com/google/GoogleUtilities.git
Working copy of https://github.com/google/GoogleUtilities.git resolved at 8.1.5
Creating working copy for https://github.com/google/interop-ios-for-google-sdks.git
Working copy of https://github.com/google/interop-ios-for-google-sdks.git resolved at 101.0.0
Creating working copy for https://github.com/google/grpc-binary.git
Working copy of https://github.com/google/grpc-binary.git resolved at 1.83.1
Creating working copy for https://github.com/google/GoogleDataTransport.git
Working copy of https://github.com/google/GoogleDataTransport.git resolved at 10.1.1
Creating working copy for https://github.com/googleads/google-ads-on-device-conversion-ios-sdk
Working copy of https://github.com/googleads/google-ads-on-device-conversion-ios-sdk resolved at 3.7.0
Creating working copy for https://github.com/facebook/facebook-ios-sdk.git
Working copy of https://github.com/facebook/facebook-ios-sdk.git resolved at 9.3.0
Creating working copy for https://github.com/google/app-check.git
Working copy of https://github.com/google/app-check.git resolved at 12.0.0
Creating working copy for https://github.com/google/GoogleAppMeasurement.git
Working copy of https://github.com/google/GoogleAppMeasurement.git resolved at 13.0.1
Downloading binary artifact https://dl.google.com/firebase/ios/swiftpm/13.0.1/FirebaseAnalytics.zip
Downloading binary artifact https://dl.google.com/firebase/ios/bin/firestore/13.1.1/rc0/FirebaseFirestoreInternal.zip
Downloading binary artifact https://dl.google.com/firebase/ios/bin/grpc/1.83.1/rc0/grpcpp.zip
Downloading binary artifact https://dl.google.com/firebase/ios/bin/grpc/1.83.1/rc0/grpc.zip
Downloading binary artifact https://dl.google.com/firebase/ios/swiftpm/13.0.1/GoogleAppMeasurement.zip
Downloading binary artifact https://dl.google.com/firebase/ios/bin/grpc/1.83.1/rc0/openssl_grpc.zip
Downloading binary artifact https://dl.google.com/firebase/ios/swiftpm/13.0.1/GoogleAppMeasurementIdentitySupport.zip
Downloading binary artifact https://dl.google.com/firebase/ios/bin/abseil/1.2025051202.0/rc0/absl.zip
Downloading binary artifact https://dl.google.com/firebase/ios/appads/3.7.0/GoogleAdsOnDeviceConversion.zip
Downloaded https://dl.google.com/firebase/ios/swiftpm/13.0.1/GoogleAppMeasurementIdentitySupport.zip (<t>s)
Downloaded https://dl.google.com/firebase/ios/swiftpm/13.0.1/FirebaseAnalytics.zip (<t>s)
Downloaded https://dl.google.com/firebase/ios/appads/3.7.0/GoogleAdsOnDeviceConversion.zip (<t>s)
Downloaded https://dl.google.com/firebase/ios/swiftpm/13.0.1/GoogleAppMeasurement.zip (<t>s)
Downloaded https://dl.google.com/firebase/ios/bin/abseil/1.2025051202.0/rc0/absl.zip (<t>s)
Downloaded https://dl.google.com/firebase/ios/bin/grpc/1.83.1/rc0/openssl_grpc.zip (<t>s)
Downloaded https://dl.google.com/firebase/ios/bin/firestore/13.1.1/rc0/FirebaseFirestoreInternal.zip (<t>s)
Downloaded https://dl.google.com/firebase/ios/bin/grpc/1.83.1/rc0/grpcpp.zip (<t>s)
Downloaded https://dl.google.com/firebase/ios/bin/grpc/1.83.1/rc0/grpc.zip (<t>s)
```

## What this does not show

* A build. Compiling these SDKs, linking binary targets, or running on a simulator was not attempted.
* Xcode. This is the SwiftPM command line; Xcode keeps its own clones in `DerivedData` and may word things differently.
* Any other version of either SDK, or other products of them.
