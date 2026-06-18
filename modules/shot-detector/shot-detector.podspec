require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'shot-detector'
  s.version        = package['version']
  s.summary        = package['description']
  s.homepage       = 'https://github.com/westari/ATHLT'
  s.license        = 'MIT'
  s.author         = 'ATHLT'
  s.source         = { :path => '.' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.4'

  # Only the module file (ShotDetectorModule.swift) — frame processor removed
  s.source_files   = 'ios/ShotDetectorModule.swift'

  s.frameworks     = 'CoreML', 'Vision', 'CoreMedia'

  # VisionCamera dependency REMOVED — frame processor is no longer used.
  # See modules/athlt-camera/ for the replacement native camera module.
  s.dependency 'ExpoModulesCore'
end
