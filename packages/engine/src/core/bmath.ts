// swf: mt.bumdum9.BMath (§\n\f&`§) — client_fr.swf, package §`\x0b\x01§.§NOJE\x03§.
// bresenham §\x04;kH§. Result cells are anonymous objects whose obfuscated keys
// "v\x01" / "l\x01" are x / y (see Square §\r\x07 \x05\x01§ in the oracle README).
export interface BCell {
  x: number;
  y: number;
}

export const BMath = {
  bresenham(x0: number, y0: number, x1: number, y1: number): BCell[] {
    let param1 = x0 | 0;
    let param2 = y0 | 0;
    let param3 = x1 | 0;
    let param4 = y1 | 0;
    let _loc6_ = 0;
    const _loc5_: BCell[] = [];
    let _loc7_ = (param3 - param1) | 0;
    let _loc8_ = (param4 - param2) | 0;
    let _loc9_ = 1;
    if (_loc7_ < _loc8_) {
      param1 ^= param3;
      param3 ^= param1;
      param1 ^= param3;
      param2 ^= param4;
      param4 ^= param2;
      param2 ^= param4;
    }
    if (_loc7_ < 0) {
      _loc7_ = -_loc7_;
      _loc9_ = -_loc9_;
    }
    if (_loc8_ < 0) {
      _loc8_ = -_loc8_;
      _loc9_ = -_loc9_;
    }
    if (_loc8_ > _loc7_) {
      _loc6_ = -(_loc8_ >> 1);
      while (param4 <= param2) {
        _loc5_.push({ x: param3, y: param4 });
        _loc6_ += _loc7_;
        if (_loc6_ > 0) {
          param3 += _loc9_;
          _loc6_ -= _loc8_;
        }
        param4++;
      }
    } else {
      _loc6_ = -(_loc7_ >> 1);
      while (param1 <= param3) {
        _loc5_.push({ x: param1, y: param2 });
        _loc6_ += _loc8_;
        if (_loc6_ > 0) {
          param2 += _loc9_;
          _loc6_ -= _loc7_;
        }
        param1++;
      }
    }
    return _loc5_;
  },
} as const;
