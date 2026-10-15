Pod::Spec.new do |s|
  s.name           = 'TextLayoutFix'
  s.version        = '1.0.0'
  s.summary        = 'Lays out unlimited React Native text with unbounded height when drawing.'
  s.description    = 'Keeps a paragraph whose frame rounds a hair below its measured height from drawing as one clipped line.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,mm}"
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20'
  }

  install_modules_dependencies(s)
end
