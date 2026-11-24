// MiniTroopers oracle instrumentation — source of the patch applied by build.ps1.
//
// This file contains ONLY our own code (no Motion-Twin code). build.ps1 decompiles
// assets/swf/client_fr.swf with JPEXS FFDec, then:
//   - HELPERS_*: the trace helpers are added as static methods of §(m]a\x02§, an empty,
//     unreferenced class of the original SWF (FFDec -importScript can only replace existing
//     classes, not add new ones). That class is recompiled from AS3; it had only an empty
//     constructor.
//   - HELPERS_PLAY_*: same, for client_fr_play.swf (build.ps1 -Play): the replay API.
//   - PC_*: call sites are inserted in the P-code of original methods (FIND must occur
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
//@@ PC_PLAY_MAIN_FIND  (client_fr_play.swf, build.ps1 -Play: Main._rsq `if(hash(data) != chk) return;`)
getlocal 6
ifeq ofs0081
returnvoid
ofs0081:
//@@ PC_PLAY_MAIN_REPLACE  (=> the `return` is removed: the hash is still computed, but any chk, or none, is accepted; the branch jumps to the next instruction either way)
getlocal 6
ifeq ofs0081
ofs0081:
//@@ HELPERS_PLAY_IMPORTS  (client_fr_play.swf: inserted after `package\n{\n` of §(m]a\x02§)
   import flash.display.BitmapData;
   import flash.external.ExternalInterface;
   import flash.utils.ByteArray;
   import flash.utils.getTimer;
   import flash.utils.setTimeout;

//@@ HELPERS_PLAY  (client_fr_play.swf: replay API, static methods of §(m]a\x02§; docs/research/lecteur-swf.md)
      // --- state (one Game per player instance). Applied index: total - queue.length - (step ? 1 : 0).
      public static var mtGame:§Q\btf§ = null;
      public static var mtTotal:int = 0;
      public static var mtCps:Array = [];
      public static var mtWaves:Array = [];
      // index of the Winner entry (BattleMsg 34, not always the last one): the battle has ended once it is applied
      public static var mtWinIdx:int = 0;
      public static var mtSpd:Number = 1;
      public static var mtAcc:Number = 0;
      public static var mtPaused:Boolean = false;
      public static var mtEnded:Boolean = false;
      // read by the Game's isFast() (PC_PLAY_FAST): suppresses the same FX as the native 16x mode
      public static var mtFast:Boolean = false;
      public static var mtIdx:int = -1;
      public static var mtWave:int = 0;
      // getTimer() at the previous state-2 frame, -1 before the first one
      public static var mtLast:int = -1;
      // seek target (-1: none) and whether its checkpoint jump is still to be done
      public static var mtSeekTo:int = -1;
      public static var mtSeekJump:Boolean = false;
      // the step mtStuck was last sent for
      public static var mtStuckOn:Object = null;
      // wall-clock time (ms) of mtInit
      public static var mtInitAt:Number = 0;
      public static var mtCalls:int = 0;

      // --- SWF -> page
      public static function mtOut(param1:String, param2:Array) : void
      {
         if(!ExternalInterface.available)
         {
            return;
         }
         try
         {
            ExternalInterface.call.apply(null,[param1].concat(param2));
         }
         catch(_loc_e_:*)
         {
         }
      }

      // --- page -> SWF (registered by mtInit on the Ruffle element)
      public static function mtPause() : void
      {
         mtPaused = true;
      }

      public static function mtResume() : void
      {
         mtPaused = false;
      }

      public static function mtSpeed(param1:Number) : void
      {
         if(isNaN(param1))
         {
            return;
         }
         mtSpd = param1 < 0.125 ? 0.125 : (param1 > 32 ? 32 : param1);
         mtFast = mtSpd >= 8 || mtSeekTo >= 0;
         mtRate();
      }

      // stage.frameRate: 40 x speed below x1, except during a seek; 40 otherwise
      public static function mtRate() : void
      {
         try
         {
            if(mtGame != null && mtGame.§\x011wD§.stage != null)
            {
               mtGame.§\x011wD§.stage.frameRate = mtSpd < 1 && mtSeekTo < 0 ? 40 * mtSpd : 40;
            }
         }
         catch(_loc_e_:*)
         {
         }
      }

      // calls: frame() calls made for playback (not for seeks); hidden: the Game clip is hidden (seek running)
      public static function mtState() : Object
      {
         return {
            "idx":(mtIdx < 0 ? 0 : mtIdx),
            "wave":mtWave,
            "total":mtTotal,
            "speed":mtSpd,
            "paused":mtPaused,
            "ended":mtEnded,
            "seeking":mtSeekTo >= 0,
            "hidden":(mtGame != null && !mtGame.§\x011wD§.visible),
            "calls":mtCalls
         };
      }

      // Forward only (n <= the applied index: nothing; the page reloads the player to go back). The Game clip is
      // hidden until the applied index reaches n and a jump's scene rebuild is done (mtSeekStep); mtProgress is sent
      // then. Ignored while the native
      // pause screen is open.
      public static function mtSeek(param1:int) : void
      {
         if(mtGame == null || mtEnded || mtGame.§w\x0b\x01o\x02§ != null)
         {
            return;
         }
         if(param1 > mtTotal)
         {
            param1 = mtTotal;
         }
         if(param1 <= mtApplied(mtGame))
         {
            return;
         }
         mtSeekTo = param1;
         mtSeekJump = true;
         mtFast = true;
         mtGame.§\x011wD§.visible = false;
         mtRate();
      }

      // the stage's pixels, ARGB 720x440, in base64 (Ruffle's WebGL canvas cannot be read reliably by the page)
      public static function mtShot() : String
      {
         var _loc1_:BitmapData = null;
         var _loc2_:ByteArray = null;
         if(mtGame == null || mtGame.§\x011wD§.stage == null)
         {
            return "";
         }
         try
         {
            _loc1_ = new BitmapData(720,440,false,0);
            _loc1_.draw(mtGame.§\x011wD§.stage);
            _loc2_ = _loc1_.getPixels(_loc1_.rect);
            _loc1_.dispose();
         }
         catch(_loc_e_:*)
         {
            return "";
         }
         return mtB64(_loc2_);
      }

      public static function mtB64(param1:ByteArray) : String
      {
         var _loc2_:String = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
         // 12-bit value -> its two characters as a big-endian 16-bit word
         var _loc3_:Array = [];
         var _loc4_:ByteArray = new ByteArray();
         var _loc5_:int = 0;
         var _loc6_:int = 0;
         while(_loc5_ < 4096)
         {
            _loc3_.push(_loc2_.charCodeAt(_loc5_ >> 6) << 8 | _loc2_.charCodeAt(_loc5_ & 63));
            _loc5_++;
         }
         param1.position = 0;
         while(param1.bytesAvailable >= 3)
         {
            _loc6_ = param1.readUnsignedShort() << 8 | param1.readUnsignedByte();
            _loc4_.writeShort(_loc3_[_loc6_ >> 12]);
            _loc4_.writeShort(_loc3_[_loc6_ & 4095]);
         }
         if(param1.bytesAvailable == 2)
         {
            _loc6_ = param1.readUnsignedShort() << 8;
            _loc4_.writeShort(_loc3_[_loc6_ >> 12]);
            _loc4_.writeByte(_loc2_.charCodeAt(_loc6_ >> 6 & 63));
            _loc4_.writeByte(61);
         }
         else if(param1.bytesAvailable == 1)
         {
            _loc6_ = param1.readUnsignedByte() << 16;
            _loc4_.writeShort(_loc3_[_loc6_ >> 12]);
            _loc4_.writeByte(61);
            _loc4_.writeByte(61);
         }
         _loc4_.position = 0;
         return _loc4_.readUTFBytes(_loc4_.length);
      }

      // --- Game hooks
      // state 0 -> 1 (PC_PLAY_GAME_INIT): the history is complete and nothing has been applied yet
      public static function mtInit(param1:§Q\btf§) : void
      {
         var _loc2_:Array = param1.§\x1e-\x02\x07\x01§;
         var _loc3_:int = 0;
         var _loc4_:int = 0;
         mtGame = param1;
         mtTotal = _loc2_.length;
         mtCps = [];
         mtWaves = [];
         mtWinIdx = mtTotal - 1;
         mtSpd = 1;
         mtAcc = 0;
         mtPaused = false;
         mtEnded = false;
         mtFast = false;
         mtIdx = -1;
         mtWave = 0;
         mtLast = -1;
         mtSeekTo = -1;
         mtSeekJump = false;
         mtStuckOn = null;
         mtCalls = 0;
         while(_loc3_ < _loc2_.length)
         {
            _loc4_ = int(_loc2_[_loc3_]["An%6"][")-Z\x19\x01"]);
            if(_loc4_ == 38)
            {
               mtCps.push(_loc3_);
            }
            else if(_loc4_ == 39)
            {
               mtWaves.push(_loc3_);
            }
            else if(_loc4_ == 34)
            {
               mtWinIdx = _loc3_;
            }
            _loc3_++;
         }
         if(ExternalInterface.available)
         {
            try
            {
               ExternalInterface.addCallback("mtPause",mtPause);
               ExternalInterface.addCallback("mtResume",mtResume);
               ExternalInterface.addCallback("mtSpeed",mtSpeed);
               ExternalInterface.addCallback("mtState",mtState);
               ExternalInterface.addCallback("mtSeek",mtSeek);
               ExternalInterface.addCallback("mtShot",mtShot);
            }
            catch(_loc_e_:*)
            {
            }
         }
         // state 1 waits for the background image: still no state-2 frame after 10 s -> stuck
         mtInitAt = new Date().time;
         setTimeout(mtWaitCheck,10000,param1);
         mtOut("mtReady",[{
            "total":mtTotal,
            "checkpoints":mtCps,
            "waves":mtWaves
         }]);
      }

      // Ruffle's setTimeout can fire early (seen after ~7 s for 10 s): re-armed until 10 s of wall time have passed
      public static function mtWaitCheck(param1:§Q\btf§) : void
      {
         var _loc2_:Number = new Date().time - mtInitAt;
         // mtLast >= 0: mtFrame has run, i.e. the Game reached state 2
         if(param1 != mtGame || mtLast >= 0)
         {
            return;
         }
         if(_loc2_ < 10000)
         {
            setTimeout(mtWaitCheck,10000 - _loc2_,param1);
            return;
         }
         mtOut("mtStuck",[mtApplied(param1)]);
      }

      // state 2 (PC_PLAY_GAME_FRAME), instead of one frame() per player frame: speed >= 1 -> floor(acc += speed)
      // calls (frame() is tick-exact, hit-stop included); speed < 1 -> one call, stage.frameRate lowered.
      // Time budget: 10 ms, or half the previous frame interval when frames are slower (slow renderer: the speed
      // still scales, the frame rate at most halves), never above 100 ms; at least one call.
      public static function mtFrame(param1:§Q\btf§) : void
      {
         var _loc2_:int = 0;
         var _loc3_:int = 0;
         var _loc4_:int = getTimer();
         var _loc5_:int = mtLast < 0 ? 0 : (_loc4_ - mtLast) >> 1;
         mtLast = _loc4_;
         if(_loc5_ < 10)
         {
            _loc5_ = 10;
         }
         else if(_loc5_ > 100)
         {
            _loc5_ = 100;
         }
         if(mtSeekTo >= 0)
         {
            mtSeekStep(param1,_loc4_,_loc5_);
         }
         else if(!mtPaused)
         {
            mtAcc += mtSpd < 1 ? 1 : mtSpd;
            _loc2_ = int(mtAcc);
            mtAcc -= _loc2_;
            if(param1.§w\x0b\x01o\x02§ != null && _loc2_ > 1)
            {
               _loc2_ = 1;
            }
            while(_loc3_ < _loc2_)
            {
               mtUnwait(param1);
               param1.§k\n/$\x03§();
               _loc3_++;
               mtCalls++;
               if(getTimer() - _loc4_ >= _loc5_)
               {
                  break;
               }
            }
         }
         if(mtSeekTo < 0)
         {
            mtReport(param1);
         }
         if(mtBlocked(param1) && param1.§^h'l\x02§ != mtStuckOn)
         {
            mtStuckOn = param1.§^h'l\x02§;
            mtOut("mtStuck",[mtApplied(param1)]);
         }
      }

      // one player frame of a seek: the checkpoint jump, then frame() calls (fast flag on, Game clip hidden) until
      // the target is reached (mtSeekDone), within the frame's time budget (param2: start, param3: budget); the stage
      // runs at 40 fps meanwhile, whatever the speed
      public static function mtSeekStep(param1:§Q\btf§, param2:int, param3:int) : void
      {
         if(param1.§w\x0b\x01o\x02§ != null)
         {
            mtSeekEnd(param1);
            return;
         }
         if(mtSeekJump)
         {
            mtSeekJump = false;
            mtJump(param1,mtSeekTo);
         }
         while(!mtSeekDone(param1) && !mtBlocked(param1))
         {
            mtUnwait(param1);
            param1.§k\n/$\x03§();
            if(getTimer() - param2 >= param3)
            {
               break;
            }
         }
         if(mtSeekDone(param1) || mtBlocked(param1))
         {
            mtSeekEnd(param1);
         }
      }

      // target reached and no scene rebuild pending (§'A~X§ is set by the jump and cleared when its CheckPoint is
      // applied): a seek landing on a CheckPoint index ends one entry later rather than show the previous scene
      public static function mtSeekDone(param1:§Q\btf§) : Boolean
      {
         return mtApplied(param1) >= mtSeekTo && !param1.§'A~X§;
      }

      public static function mtSeekEnd(param1:§Q\btf§) : void
      {
         mtSeekTo = -1;
         mtSeekJump = false;
         mtFast = mtSpd >= 8;
         mtAcc = 0;
         param1.§\x011wD§.visible = true;
         mtRate();
      }

      // The Game's checkpoint skip (Space, §KV\t\x16\x03§) generalised to a target index: the queue restarts at the
      // last CheckPoint (BattleMsg 38) at or before param2, whose application rebuilds the scene; the hit-stop queue
      // is cleared too. Nothing to do if that checkpoint is already next.
      public static function mtJump(param1:§Q\btf§, param2:int) : void
      {
         var _loc3_:Array = param1.§\x1e-\x02\x07\x01§;
         var _loc4_:int = mtTotal - _loc3_.length;
         var _loc5_:int = -1;
         var _loc6_:int = 0;
         var _loc7_:Array = null;
         while(_loc6_ < _loc3_.length && _loc4_ + _loc6_ <= param2)
         {
            if(int(_loc3_[_loc6_]["An%6"][")-Z\x19\x01"]) == 38)
            {
               _loc5_ = _loc6_;
            }
            _loc6_++;
         }
         if(_loc5_ <= 0)
         {
            return;
         }
         param1.§\x1e-\x02\x07\x01§ = _loc3_.slice(_loc5_);
         if(param1.§^h'l\x02§ != null)
         {
            param1.§^h'l\x02§.aGx2();
         }
         param1.§'A~X§ = true;
         param1.§uN\x0ed§ = int(param1.§\x1e-\x02\x07\x01§[0]["uN\x0ed"]) - 1;
         param1.§~Y\x12(\x01§ = [];
         _loc7_ = param1.§{DEL}=\x04u§.concat();
         _loc6_ = 0;
         while(_loc6_ < _loc7_.length)
         {
            _loc7_[_loc6_].ylcZ();
            _loc6_++;
         }
      }

      public static function mtApplied(param1:§Q\btf§) : int
      {
         return mtTotal - param1.§\x1e-\x02\x07\x01§.length - (param1.§^h'l\x02§ != null ? 1 : 0);
      }

      // The steps of PlayerStatus (BattleMsg 40) and Winner (34) never use their entry's tid trooper in apply(), but
      // their constructor still waits for it to be on screen. After a checkpoint jump the rebuild has removed the dead
      // troopers, so such an entry after that CheckPoint whose tid died would wait forever (seen on a raid: a seek to
      // the end stuck after the last CheckPoint, the Winner never applied). Their pending ids are dropped; in a plain
      // replay the tid trooper is still on screen (dying at worst), so nothing changes there.
      public static function mtUnwait(param1:§Q\btf§) : void
      {
         var _loc2_:* = param1.§^h'l\x02§;
         var _loc3_:int = _loc2_ == null ? -1 : int(_loc2_.§SV\x1d\x01§["An%6"][")-Z\x19\x01"]);
         if((_loc3_ == 40 || _loc3_ == 34) && _loc2_.§(;D\n§.length > 0)
         {
            _loc2_.§(;D\n§ = [];
         }
      }

      // the current step has waited more than its 500 ticks (the Game's own debug timeout)
      public static function mtBlocked(param1:§Q\btf§) : Boolean
      {
         var _loc2_:* = param1.§^h'l\x02§;
         return _loc2_ != null && int(_loc2_["/\x12#\x1c\x02"]) <= 0;
      }

      // mtProgress(idx, wave) when the applied index changed; mtEnd() once the Winner entry is applied
      public static function mtReport(param1:§Q\btf§) : void
      {
         var _loc2_:int = mtApplied(param1);
         if(_loc2_ == mtIdx)
         {
            return;
         }
         mtIdx = _loc2_;
         while(mtWave < mtWaves.length && mtWaves[mtWave] < _loc2_)
         {
            mtWave++;
         }
         mtOut("mtProgress",[_loc2_,mtWave]);
         if(_loc2_ > mtWinIdx && !mtEnded)
         {
            mtEnded = true;
            mtOut("mtEnd",[]);
         }
      }
//@@ PC_PLAY_GAME_INIT_FIND  (Game ENTER_FRAME handler, state 0 -> 1, same spot as PC_GAME)
getlex QName(PackageNamespace(""),"(\x1ar3")
getproperty QName(PackageNamespace(""),"{DEL}\x0fY@")
initproperty QName(PackageNamespace(""),")\x11\x1d\x0e")
jump ofs0068
//@@ PC_PLAY_GAME_INIT_REPLACE  (=> `§(m]a\x02§.mtInit(this);` once the history is complete, before any animation)
getlex QName(PackageNamespace(""),"(\x1ar3")
getproperty QName(PackageNamespace(""),"{DEL}\x0fY@")
initproperty QName(PackageNamespace(""),")\x11\x1d\x0e")
getlex QName(PackageNamespace(""),"(m]a\x02")
getlocal0
callpropvoid QName(PackageNamespace(""),"mtInit"), 1
jump ofs0068
//@@ PC_PLAY_GAME_FRAME_FIND  (Game ENTER_FRAME handler, state 2: `this.frame();`)
ofs0093:
findproperty QName(PackageNamespace(""),"k\n/$\x03")
callpropvoid QName(PackageNamespace(""),"k\n/$\x03"), 0
ofs009a:
//@@ PC_PLAY_GAME_FRAME_REPLACE  (=> `§(m]a\x02§.mtFrame(this);`, which calls frame() 0..n times)
ofs0093:
getlex QName(PackageNamespace(""),"(m]a\x02")
getlocal0
callpropvoid QName(PackageNamespace(""),"mtFrame"), 1
ofs009a:
//@@ PC_PLAY_FAST_FIND  (Game isFast() §Bl{K\x01§: `return ticksPerFrame >= 8;`)
pushbyte 8
greaterequals
returnvalue
//@@ PC_PLAY_FAST_REPLACE  (=> `return (ticksPerFrame >= 8) | §(m]a\x02§.mtFast;`)
pushbyte 8
greaterequals
getlex QName(PackageNamespace(""),"(m]a\x02")
getproperty QName(PackageNamespace(""),"mtFast")
bitor
convert_b
returnvalue
//@@ END
