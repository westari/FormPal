require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'athlt-camera'
  s.version        = package['version']
  s.summary        = package['description']
  s.homepage       = 'https://athlt.app'
  s.license        = 'MIT'
  s.author         = 'ATHLT'
  # source: path-based so expo autolinking finds it from ./modules
  s.source         = { :path => '.' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'

  s.source_files   = 'ios/**/*.{swift,h,m,mm}'

  # System frameworks — all available without additional pods
  s.frameworks     = 'AVFoundation', 'CoreML', 'Vision', 'CoreMedia', 'CoreVideo', 'UIKit'

  s.dependency 'ExpoModulesCore'
  # MediaPipe Tasks — BlazePose 3D world landmarks (guarded by ENABLE_BLAZEPOSE flag)
  s.dependency 'MediaPipeTasksVision', '~> 0.10'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE'          => 'YES',
    'SWIFT_COMPILATION_MODE'  => 'wholemodule',
    'OTHER_LDFLAGS'           => '$(inherited)',
  }
end
