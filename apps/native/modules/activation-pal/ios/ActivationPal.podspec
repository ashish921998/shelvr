Pod::Spec.new do |s|
  s.name           = 'ActivationPal'
  s.version        = '1.0.0'
  s.summary        = 'ActivationPal analytics for Shelvr.'
  s.description    = 'The single-file ActivationPal iOS SDK and its Expo Modules bridge.'
  s.author         = ''
  s.homepage       = 'https://activationpal.com'
  s.platforms      = {
    :ios => '15.0'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
