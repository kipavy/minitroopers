// MiniTroopers oracle instrumentation — source of the patch applied by build.ps1.
//
// This file contains ONLY our own code (no Motion-Twin code). build.ps1 decompiles
// assets/swf/client_fr.swf with JPEXS FFDec, then:
//   - HELPERS_*: the trace helpers are added as static methods of §(m]a\x02§, an empty,
//     unreferenced class of the original SWF (FFDec -importScript can only replace existing
//     classes, not add new ones). That class is recompiled from AS3; it had only an empty
//     constructor.
//   - PC_*: three call sites are inserted in the P-code of original methods (FIND must occur
//     exactly once in the method, it is replaced by REPLACE), via `ffdec -replace <script>
//     <pcode> <methodBodyIndex>`. No original method is recompiled from AS3, so their
//     bytecode stays identical except for the inserted instructions.
//
// Obfuscated names (see README.md for the full table):
//   §Q\btf§                  Game (owns the Battle, calls Battle.resolve() 200x per ENTER_FRAME)
//   §,7u\x1f§                Main (reads flashvars, checks `chk`, loads gfx, builds Game)
//   §P!L/\x02§.§59=F\x03§    logic.Trooper ; §(\x07\x184§ = Trooper.init(Battle)
//   §P!L/\x02§.§\x0b\x0eNO§  logic.Battle ; MnRZ() = resolve()
//
// Sections are delimited by `//@@ <name>` lines; their text is used verbatim. {DEL} stands
// for a raw U+007F character, which FFDec prints inside some obfuscated identifiers.

//@@ HELPERS_IMPORTS  (inserted after `package\n{\n` of §(m]a\x02§)
   import flash.utils.getQualifiedClassName;

//@@ HELPERS  (inserted in class §(m]a\x02§, just before its constructor)
      public static function mtEsc(param1:String) : String
      {
         var _loc2_:String = "";
         var _loc3_:int = 0;
         var _loc4_:int = 0;
         var _loc5_:String = null;
         while(_loc3_ < param1.length)
         {
            _loc4_ = param1.charCodeAt(_loc3_);
            _loc3_++;
            if(_loc4_ < 32 || _loc4_ > 126 || "\\\"|;=,{}[]()<>".indexOf(param1.charAt(_loc3_ - 1)) >= 0)
            {
               _loc5_ = _loc4_.toString(16);
               while(_loc5_.length < 4)
               {
                  _loc5_ = "0" + _loc5_;
               }
               _loc2_ += "\\u" + _loc5_;
            }
            else
            {
               _loc2_ += param1.charAt(_loc3_ - 1);
            }
         }
         return _loc2_;
      }

      public static function mtStr(param1:*, param2:int = 0) : String
      {
         var _loc3_:Boolean = false;
         var _loc4_:Array = null;
         var _loc5_:int = 0;
         var _loc6_:String = null;
         if(param1 === null || param1 === undefined)
         {
            return "null";
         }
         if(param2 > 16)
         {
            return "<deep>";
         }
         if(param1 is Boolean)
         {
            return param1 ? "true" : "false";
         }
         if(param1 is Number)
         {
            return String(param1);
         }
         if(param1 is String)
         {
            return "\"" + §(m]a\x02§.mtEsc(param1) + "\"";
         }
         if(param1 is Array)
         {
            _loc4_ = [];
            _loc5_ = 0;
            while(_loc5_ < param1.length)
            {
               _loc4_.push(§(m]a\x02§.mtStr(param1[_loc5_],param2 + 1));
               _loc5_++;
            }
            return "[" + _loc4_.join(",") + "]";
         }
         if(param1 is §P!L/\x02§.§\x15)\x01\x02§)
         {
            return "T" + String(§P!L/\x02§.§\x15)\x01\x02§(param1).§(m\x0fl\x01§());
         }
         if(param1 is §P!L/\x02§.§\r\x07 \x05\x01§)
         {
            return "Q" + §P!L/\x02§.§\r\x07 \x05\x01§(param1).§v\x01§ + ":" + §P!L/\x02§.§\r\x07 \x05\x01§(param1).§l\x01§;
         }
         if(param1 is Function)
         {
            return "<fn>";
         }
         try
         {
            _loc3_ = param1.__enum__ === true;
         }
         catch(_loc_e_:*)
         {
            _loc3_ = false;
         }
         if(_loc3_)
         {
            _loc4_ = param1["7\x02@d\x02"];
            _loc6_ = String(int(param1[")-Z\x19\x01"]));
            if(_loc4_ == null || _loc4_.length == 0)
            {
               return _loc6_;
            }
            return _loc6_ + "(" + §(m]a\x02§.mtStr(_loc4_,param2 + 1).slice(1,-1) + ")";
         }
         if(getQualifiedClassName(param1) == "Object")
         {
            _loc4_ = [];
            for(_loc6_ in param1)
            {
               _loc4_.push(_loc6_);
            }
            _loc4_.sort();
            _loc5_ = 0;
            while(_loc5_ < _loc4_.length)
            {
               _loc4_[_loc5_] = §(m]a\x02§.mtEsc(_loc4_[_loc5_]) + "=" + §(m]a\x02§.mtStr(param1[_loc4_[_loc5_]],param2 + 1);
               _loc5_++;
            }
            return "{" + _loc4_.join(";") + "}";
         }
         return "<" + §(m]a\x02§.mtEsc(getQualifiedClassName(param1)) + ">";
      }

      public static function mtTrp(param1:§P!L/\x02§.§59=F\x03§) : void
      {
         var _loc5_:* = null;
         var _loc2_:* = param1.§we\f=\x03§;
         var _loc3_:Array = [];
         var _loc4_:Array = [];
         var _loc6_:int = -1;
         var _loc7_:int = 0;
         var _loc8_:Array = _loc2_.§0\x06@F\x03§;
         while(_loc7_ < _loc8_.length)
         {
            _loc3_.push(§(m]a\x02§.mtStr(_loc8_[_loc7_]));
            _loc7_++;
         }
         _loc7_ = 0;
         _loc8_ = param1.§\x1dI\x02\r\x03§;
         while(_loc7_ < _loc8_.length)
         {
            _loc5_ = _loc8_[_loc7_];
            if(_loc5_ === param1.§5\tmF§)
            {
               _loc6_ = _loc7_;
            }
            _loc4_.push(§(m]a\x02§.mtStr(_loc5_.§5E[\x1d§.§7X\x01§) + ":" + _loc5_.§+8\x19{DEL}§ + ":" + _loc5_.§\x1ap\x04f§ + ":" + (_loc5_.§\x0fV8\x16\x02§ ? "1" : "0"));
            _loc7_++;
         }
         trace("TRP " + param1.§(m\x0fl\x01§() + "|" + param1.§9\x118u§ + "|" + param1.§\x12?g-§ + "|" + param1.§uN\x0ed§ + "|" + _loc2_.§\n@?\x01§ + "|" + _loc3_.join(",") + "|" + _loc4_.join(",") + "|" + _loc6_ + "|" + (param1.§K(m`\x01§ == null ? "-" : §(m]a\x02§.mtStr(param1.§K(m`\x01§)) + "|" + (param1.§(\x1f\x15F\x01§ ? "1" : "0") + "|" + (param1.§\x1c(h7\x03§ ? "1" : "0"));
      }

      public static function mtDump(param1:*) : void
      {
         var _loc4_:* = null;
         var _loc2_:Array = param1.§7\x13JZ\x03§;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_.length)
         {
            _loc4_ = _loc2_[_loc3_];
            trace("EV " + §(m]a\x02§.mtStr(_loc4_["uN\x0ed"]) + "|" + §(m]a\x02§.mtStr(_loc4_["\x1e,d\x01"]) + "|" + §(m]a\x02§.mtStr(_loc4_["An%6"]));
            _loc3_++;
         }
         _loc2_ = [];
         _loc3_ = 0;
         while(_loc3_ < param1.§8X}L\x01§.length)
         {
            _loc2_.push(§(m]a\x02§.mtStr(param1.§8X}L\x01§[_loc3_]));
            _loc3_++;
         }
         trace("END " + §(m]a\x02§.mtStr(param1.§\x1e1\\J\x01§) + "|" + _loc2_.join(","));
         trace("MTDONE");
      }
//@@ PC_TROOPER_FIND  (Trooper.init: its single returnvoid, at the very end)
returnvoid
end ; code
//@@ PC_TROOPER_REPLACE  (=> `§(m]a\x02§.mtTrp(this);` as the last statement of Trooper.init)
getlex QName(PackageNamespace(""),"(m]a\x02")
getlocal0
callpropvoid QName(PackageNamespace(""),"mtTrp"), 1
returnvoid
end ; code
//@@ PC_GAME_FIND  (Game ENTER_FRAME handler, step 0: `if(battle.resolve()) { history = battle.history; step = <next>; break; }`)
getlex QName(PackageNamespace(""),"(\x1ar3")
getproperty QName(PackageNamespace(""),"{DEL}\x0fY@")
initproperty QName(PackageNamespace(""),")\x11\x1d\x0e")
jump ofs0068
//@@ PC_GAME_REPLACE  (=> `§(m]a\x02§.mtDump(battle);` right after the battle is fully computed, before any animation)
getlex QName(PackageNamespace(""),"(\x1ar3")
getproperty QName(PackageNamespace(""),"{DEL}\x0fY@")
initproperty QName(PackageNamespace(""),")\x11\x1d\x0e")
getlex QName(PackageNamespace(""),"(m]a\x02")
getlocal0
getproperty QName(PackageNamespace(""),"S\rNK\x02")
callpropvoid QName(PackageNamespace(""),"mtDump"), 1
jump ofs0068
//@@ PC_MAIN_FIND  (Main._rsq: `if(hash(data) != chk) return;`)
getlocal 6
ifeq ofs0081
returnvoid
ofs0081:
//@@ PC_MAIN_REPLACE  (=> `if(hash(data) != chk && chk != null) return;` — the hash is still computed; the oracle runs without a `chk` flashvar)
getlocal 6
ifeq ofs0081
getlocal 6
pushnull
ifeq ofs0081
returnvoid
ofs0081:
//@@ END
