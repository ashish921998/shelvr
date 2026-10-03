#import <objc/runtime.h>

#import <react/renderer/textlayoutmanager/RCTTextLayoutManager.h>

using facebook::react::ParagraphAttributes;

// Fabric measures text with unbounded height but draws and hit-tests it in a
// container sized to the view frame. Far down a long page, Yoga's float pixel
// rounding can leave that frame a hair short of the measured height (57.9998
// for 58). TextKit then fits one line fewer, and because unlimited text uses
// NSLineBreakByClipping, the whole last paragraph lands on one clipped line.
// React Native ships prebuilt on iOS, so this swaps the implementation at load
// instead of patching the source. Same fix as upstream would need in
// -[RCTTextLayoutManager _textStorageAndLayoutManagerWithAttributesString:...].
@interface RCTTextLayoutManager (TextLayoutFix)
- (NSTextStorage *)_textStorageAndLayoutManagerWithAttributesString:(NSAttributedString *)attributedString
                                                paragraphAttributes:(ParagraphAttributes)paragraphAttributes
                                                               size:(CGSize)size;
@end

using TextStorageImp = NSTextStorage *(*)(id, SEL, NSAttributedString *, ParagraphAttributes, CGSize);

static TextStorageImp originalTextStorage;

static NSTextStorage *textStorageWithUnboundedHeight(
    id self,
    SEL _cmd,
    NSAttributedString *attributedString,
    ParagraphAttributes paragraphAttributes,
    CGSize size)
{
  if (paragraphAttributes.maximumNumberOfLines == 0 && !paragraphAttributes.adjustsFontSizeToFit) {
    size.height = CGFLOAT_MAX;
  }
  return originalTextStorage(self, _cmd, attributedString, paragraphAttributes, size);
}

@interface TextLayoutFix : NSObject
@end

@implementation TextLayoutFix

+ (void)load
{
  SEL selector = @selector(_textStorageAndLayoutManagerWithAttributesString:paragraphAttributes:size:);
  Method method = class_getInstanceMethod(NSClassFromString(@"RCTTextLayoutManager"), selector);
  // A React Native upgrade that renames the method or changes its signature
  // turns this into a no-op rather than a crash.
  if (method == nullptr || strstr(method_getTypeEncoding(method), "ParagraphAttributes") == nullptr) {
    return;
  }
  originalTextStorage = (TextStorageImp)method_setImplementation(method, (IMP)textStorageWithUnboundedHeight);
}

@end
