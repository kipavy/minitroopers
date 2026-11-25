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
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.external.ExternalInterface;
   import flash.geom.ColorTransform;
   import flash.utils.ByteArray;
   import flash.utils.Dictionary;
   import flash.utils.getQualifiedClassName;
   import flash.utils.getTimer;
   import flash.utils.setTimeout;

//@@ HELPERS_PLAY  (client_fr_play.swf: replay API, static methods of §(m]a\x02§; docs/research/lecteur-swf.md)
      // --- state (one Game per player instance). Applied index: total - queue.length - (step ? 1 : 0).
      public static var mtGame:§Q\btf§ = null;
      public static var mtTotal:int = 0;
      public static var mtCps:Array = [];
      public static var mtWaves:Array = [];
      // per wave: the history index of its first keyframe (after the NewWave's resolve(): the new wave deployed), where a
      // jump needs no replay
      public static var mtStarts:Array = [];
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
      // target of a seek still replaying over frames (-1: none)
      public static var mtSeekTo:int = -1;
      // the step mtStuck was last sent for
      public static var mtStuckOn:Object = null;
      // wall-clock time (ms) of mtInit
      public static var mtInitAt:Number = 0;
      public static var mtCalls:int = 0;
      // keyframes taken by mtKf while the battle is computed: {i: entries applied, t: trooper infos, x: their extra
      // state, d: this wave's dead, g: weapons on the ground}; the battle they belong to; history length at the last one;
      // next history index to scan for NewWave
      public static var mtKfs:Array = [];
      public static var mtKfB:* = null;
      public static var mtKfN:int = 0;
      public static var mtKfScan:int = 0;
      // logic trooper -> its body lies "down" on screen: it was on the ground (FALLEN) after the last resolve() it was
      // alive, or the resolve() that killed it knocked it flying (hit effect 2: it lands on the ground). Its state then
      // says DEAD only. mtKfDead: logic troopers already seen dead.
      public static var mtKfFall:Dictionary = new Dictionary();
      public static var mtKfDead:Dictionary = new Dictionary();
      // deep copy of Battle.history taken by mtInit: the Game plays copies, the history itself is never touched
      public static var mtHist:Array = [];
      // mtGoto target waiting for the Game's state 2 (-1: none)
      public static var mtPend:int = -1;
      // test support: playback pauses once this index is applied (-1: none)
      public static var mtStop:int = -1;

      // --- serialisation, same code as the trace build's (HELPERS): mtHistStr lines compare to the oracle's EV lines
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
         if(Object(param1).constructor === Object)
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
      // Pause is the Game's own (§;y\x1a-§, a click on the battlefield): its pause screen §w\x0b\x01o\x02§ (a grey snapshot of the
      // field, "PAUSE", a trooper's card on a click on him) is open and frame() only ticks it. mtPause / mtResume open
      // and close that same screen; a native click or a trooper click is followed (mtOnClick, mtPauseSync), and the page
      // hears of every change (mtPaused(paused)). A jump or mtSettle sets the open screen aside (mtPauseOff: frame() has
      // to run the battle; the screen stays shown) and puts it back with a new snapshot (mtPauseOn): the pause stays.
      // mtScreen: the screen set aside; mtClosing: the screen fading out after a resume; mtPauseWant: pause asked before
      // the battle plays (opened at its first frame); mtClickOn: the background sprite mtOnClick listens to.
      public static var mtScreen:* = null;
      public static var mtClosing:* = null;
      public static var mtPauseWant:Boolean = false;
      public static var mtClickOn:* = null;

      public static function mtPause() : void
      {
         var _loc1_:§Q\btf§ = mtGame;
         if(mtPaused)
         {
            return;
         }
         mtPaused = true;
         // the screen opens at the next frame (mtPauseSync): its 720x440 snapshot is not allocated inside the page's
         // call (Ruffle web: a memory growth during an ExternalInterface call detaches the page's buffer); no entry is
         // applied meanwhile (mtFrame plays nothing while paused)
         mtPauseWant = true;
         mtOut("mtPaused",[true]);
      }

      public static function mtResume() : void
      {
         var _loc1_:§Q\btf§ = mtGame;
         var _loc2_:* = null;
         if(!mtPaused)
         {
            return;
         }
         mtPaused = false;
         mtPauseWant = false;
         if(mtScreen != null)
         {
            _loc2_ = mtScreen;
            mtScreen = null;
            _loc2_.aGx2();
         }
         else if(_loc1_ != null && _loc1_.§w\x0b\x01o\x02§ != null && _loc1_.§w\x0b\x01o\x02§ !== mtClosing)
         {
            // as the native toggle: the screen fades out (§fl@@\x02§), frame() ticks it until it is gone
            mtClosing = _loc1_.§w\x0b\x01o\x02§;
            mtClosing.§fl@@\x02§();
         }
         mtOut("mtPaused",[false]);
      }

      // opens the pause screen, or puts back the one set aside (closing its trooper card, new snapshot of the field)
      public static function mtPauseOn(param1:§Q\btf§) : void
      {
         var _loc2_:BitmapData = null;
         mtPauseWant = false;
         if(mtScreen != null)
         {
            param1.§w\x0b\x01o\x02§ = mtScreen;
            §`\x0b\x01§.§{DEL}\f\x01§.§5\x1f\x01§.§\x1bxD1\x03§ = mtScreen.§;\x1az\x01§;
            mtScreen = null;
            param1.§w\x0b\x01o\x02§.§XiN4\x03§();
            // the clips' bitmaps are brought to their current frame first (a restore sets them without a tick)
            §`\x0b\x01§.§\tnP+§.§;io&§.§i'\x04W\x02§();
            _loc2_ = param1.§w\x0b\x01o\x02§.§UK\r\x01§.bitmapData;
            _loc2_.fillRect(_loc2_.rect,16711680);
            _loc2_.draw(§n#\x07\f§.§*#\x01§.§\x011wD§);
         }
         else if(param1.§w\x0b\x01o\x02§ == null)
         {
            param1.§w\x0b\x01o\x02§ = new §^\x05\x01!§.§J\b\x17Z\x03§();
         }
      }

      // before a jump or mtSettle: the open screen set aside, a fading one removed at once
      public static function mtPauseOff(param1:§Q\btf§) : void
      {
         if(param1.§w\x0b\x01o\x02§ == null)
         {
            return;
         }
         if(!mtPaused || param1.§w\x0b\x01o\x02§ === mtClosing)
         {
            mtClosing = null;
            param1.§w\x0b\x01o\x02§.aGx2();
            return;
         }
         mtScreen = param1.§w\x0b\x01o\x02§;
         param1.§w\x0b\x01o\x02§ = null;
         §`\x0b\x01§.§{DEL}\f\x01§.§5\x1f\x01§.§\x1bxD1\x03§ = param1.§;\x1az\x01§;
      }

      // MOUSE_DOWN on the battlefield, after the Game's own listener (registered later) has toggled its pause
      public static function mtOnClick(param1:*) : void
      {
         var _loc2_:§Q\btf§ = mtGame;
         if(_loc2_ == null)
         {
            return;
         }
         if(mtSeekTo >= 0 || mtScreen != null)
         {
            // a jump is running (its screen set aside): the toggle opened a new screen over a battle being replayed;
            // removed, the click toggles the pause wanted at the jump's end
            if(_loc2_.§w\x0b\x01o\x02§ != null)
            {
               _loc2_.§w\x0b\x01o\x02§.aGx2();
            }
            if(mtPaused)
            {
               mtResume();
            }
            else
            {
               mtPause();
            }
            return;
         }
         if(mtPaused)
         {
            mtPaused = false;
            mtPauseWant = false;
            if(_loc2_.§w\x0b\x01o\x02§ != null)
            {
               mtClosing = _loc2_.§w\x0b\x01o\x02§;
            }
            mtOut("mtPaused",[false]);
         }
         else if(_loc2_.§w\x0b\x01o\x02§ != null && _loc2_.§w\x0b\x01o\x02§ !== mtClosing)
         {
            mtPaused = true;
            mtOut("mtPaused",[true]);
         }
      }

      // each frame of state 2 out of a jump: listener in place; a screen opened by the Game (trooper click) or gone
      public static function mtPauseSync(param1:§Q\btf§) : void
      {
         var _loc2_:* = §n#\x07\f§.§*#\x01§.§*M\x01§;
         if(_loc2_ != null && mtClickOn !== _loc2_)
         {
            _loc2_.addEventListener(MouseEvent.MOUSE_DOWN,mtOnClick);
            mtClickOn = _loc2_;
         }
         if(mtClosing != null && param1.§w\x0b\x01o\x02§ !== mtClosing)
         {
            mtClosing = null;
         }
         if(mtPauseWant)
         {
            if(mtPaused)
            {
               mtPauseOn(param1);
            }
            mtPauseWant = false;
         }
         else if(param1.§w\x0b\x01o\x02§ != null && param1.§w\x0b\x01o\x02§ !== mtClosing && !mtPaused)
         {
            mtPaused = true;
            mtOut("mtPaused",[true]);
         }
         else if(mtPaused && mtScreen == null && param1.§w\x0b\x01o\x02§ == null)
         {
            mtPaused = false;
            mtOut("mtPaused",[false]);
         }
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
            "screen":mtGame != null && (mtGame.§w\x0b\x01o\x02§ != null || mtScreen != null),
            "ended":mtEnded,
            "seeking":mtSeekTo >= 0 || mtSimTarget >= 0,
            "complete":mtSimDone,
            "target":mtSimTarget,
            "ahead":mtAheadN,
            "sim":mtSimSt,
            "hidden":(mtGame != null && !mtGame.§\x011wD§.visible),
            "calls":mtCalls,
            "kf":mtKfs.length,
            "banner":mtWinner(mtGame) != null,
            "playing":(mtGame != null && int(mtGame.§)\x11\x1d\x0e§.§)-Z\x19\x01§) == 2),
            "prof":mtProf,
            "pool":mtPoolN,
            "waves":mtWaves,
            "starts":mtStarts
         };
      }

      public static function mtSeek(param1:int) : Boolean
      {
         return mtGoto(param1);
      }

      // Instant seek, both ways (n clamped to [0, total]; past the entries simulated so far, see mtSimTarget): restores the last keyframe at or before n (unless the current
      // position is closer), then replays up to n hidden and synchronously, for at most 250 ms; the rest, if any, is
      // replayed over the next frames (mtSeekStep). mtProgress is sent once n is reached; mtEnd again if n is past the
      // Winner entry. Pause and speed are kept: during the pause, the pause screen stays (set aside, then put back over the scene at n).
      // Returns true if n is reached on return; false if deferred (Game not playing yet: done at its first frame) or still replaying.
      public static function mtGoto(param1:int) : Boolean
      {
         var _loc2_:§Q\btf§ = mtGame;
         var _loc3_:int = 0;
         var _loc4_:int = 0;
         var _loc5_:int = 0;
         var _loc6_:int = 0;
         var _loc7_:int = 0;
         var _loc8_:int = 0;
         if(_loc2_ == null)
         {
            return false;
         }
         if(param1 < 0)
         {
            param1 = 0;
         }
         // past the entries simulated so far: done once they exist (mtSimSync), 30 resolve() steps per frame meanwhile
         if(param1 > mtTotal && !mtSimDone)
         {
            mtSimTarget = param1;
            return false;
         }
         mtSimTarget = -1;
         if(param1 > mtTotal)
         {
            param1 = mtTotal;
         }
         // state 1 (waiting for the background image): if it is there, start the playback state now, as the
         // Game's next frame would
         if(int(_loc2_.§)\x11\x1d\x0e§.§)-Z\x19\x01§) == 1 && §n#\x07\f§.§*#\x01§.§*M\x01§ != null)
         {
            _loc2_.§e\b(C\x03§();
            _loc2_.§)\x11\x1d\x0e§ = §(\x1ar3§.§c8Y#\x02§;
         }
         if(int(_loc2_.§)\x11\x1d\x0e§.§)-Z\x19\x01§) != 2)
         {
            mtPend = param1;
            return false;
         }
         mtPend = -1;
         mtWarmHold = 20;
         mtPauseOff(_loc2_);
         _loc6_ = getTimer();
         mtPDraw = 0;
         mtPAdv = 0;
         mtProfR = [];
         _loc3_ = mtApplied(_loc2_);
         _loc4_ = mtKfs.length - 1;
         if(param1 > mtWinIdx && _loc3_ <= mtWinIdx && int(mtKfs[mtKfs.length - 1].i) == mtTotal)
         {
            // past the Winner entry (the end): the final keyframe, then the Winner applied at once (its application
            // empties the queue); the panels show the last PlayerStatus before the Winner
            mtRestore(_loc2_,mtKfs[mtKfs.length - 1],mtWinIdx);
            _loc2_.apply(mtCopy(mtHist[mtWinIdx]),[]);
            _loc2_.§\x1e-\x02\x07\x01§ = [];
         }
         else
         {
            while(_loc4_ > 0 && (int(mtKfs[_loc4_].i) > param1 || int(mtKfs[_loc4_].i) > mtWinIdx))
            {
               _loc4_--;
            }
            if(_loc3_ > param1 || _loc3_ < int(mtKfs[_loc4_].i))
            {
               mtRestore(_loc2_,mtKfs[_loc4_]);
            }
         }
         mtSeekTo = param1;
         mtFast = true;
         _loc5_ = getTimer();
         _loc7_ = mtApplied(_loc2_);
         while(mtApplied(_loc2_) < param1 && !mtBlocked(_loc2_) && getTimer() - _loc5_ < 250)
         {
            if(_loc2_.§\x011wD§.visible)
            {
               _loc2_.§\x011wD§.visible = false;
            }
            mtUnwait(_loc2_);
            mtHurry(_loc2_);
            _loc2_.§k\n/$\x03§();
            _loc8_++;
         }
         mtProf = [_loc5_ - _loc6_,getTimer() - _loc5_,_loc8_,mtApplied(_loc2_) - _loc7_,mtPDraw,mtPAdv].concat(mtProfR);
         if(mtApplied(_loc2_) >= param1 || mtBlocked(_loc2_))
         {
            mtSeekEnd(_loc2_);
         }
         else
         {
            _loc2_.§\x011wD§.visible = false;
            mtRate();
         }
         return mtSeekTo < 0;
      }

      // last mtGoto: [restore ms, replay ms, frame() calls, entries replayed, ms rendering clips, ms advancing clips during
      // the replay, then the restore's sections (mtProfR)]
      public static var mtProf:Array = [];
      public static var mtProfR:Array = [];
      public static var mtPDraw:int = 0;
      public static var mtPAdv:int = 0;

      // PC_PLAY_TICK: the tick's two clip calls (render all, advance all), timed for mtProf
      public static function mtClips() : void
      {
         var _loc1_:int = getTimer();
         var _loc2_:int = 0;
         mtKeep();
         if(mtSeekTo >= 0 && mtGame != null && !mtGame.§\x011wD§.visible)
         {
            mtClipsSeek();
            mtPDraw += getTimer() - _loc1_;
            return;
         }
         §`\x0b\x01§.§\tnP+§.§;io&§.§i'\x04W\x02§();
         _loc2_ = getTimer();
         mtPDraw += _loc2_ - _loc1_;
         §`\x0b\x01§.§\tnP+§.§;io&§.§?d0r\x01§();
         mtPAdv += getTimer() - _loc2_;
      }

      // Hidden replay: the same render-all then advance-all, but the clips of idle troopers whose animation loops or is
      // over (standing, lying, held poses) are left as they are: nothing waits on them and they are not shown; they
      // resume with the playback. The troopers the replayed entries animate are not idle.
      public static function mtClipsSeek() : void
      {
         var _loc1_:Dictionary = new Dictionary();
         var _loc2_:Array = mtGame.§`1\x1f*\x02§;
         var _loc3_:int = 0;
         var _loc4_:* = null;
         var _loc5_:* = null;
         while(_loc3_ < _loc2_.length)
         {
            _loc4_ = _loc2_[_loc3_];
            _loc3_++;
            _loc5_ = _loc4_.§\x05\x03\x1a\x01§;
            if(_loc5_ != null && _loc4_.§\x10\x1e\x01§ != null && (!_loc5_.§,\x0ew^\x01§ || _loc5_.§Yx\x02V\x01§) && _loc4_.§\x01|fz\x01§())
            {
               _loc1_[_loc4_.§\x10\x1e\x01§] = true;
            }
         }
         _loc4_ = §`\x0b\x01§.§\tnP+§.§;io&§.§kwVg\x02§.§C{+N§;
         while(_loc4_ != null)
         {
            _loc5_ = _loc4_.§)\x1e;\x01§;
            _loc4_ = _loc4_.§|Icg§;
            if(_loc1_[_loc5_] !== true)
            {
               _loc5_.§c+,Y§();
            }
         }
         _loc4_ = §`\x0b\x01§.§\tnP+§.§;io&§.§kwVg\x02§.§C{+N§;
         while(_loc4_ != null)
         {
            _loc5_ = _loc4_.§)\x1e;\x01§;
            _loc4_ = _loc4_.§|Icg§;
            if(_loc1_[_loc5_] !== true)
            {
               _loc5_.§;a/P\x03§();
            }
         }
      }

      // the Winner action (BattleMsg 34) still running, if any
      public static function mtWinner(param1:§Q\btf§) : Object
      {
         var _loc2_:int = 0;
         if(param1 == null)
         {
            return null;
         }
         while(_loc2_ < param1.§{DEL}=\x04u§.length)
         {
            if(param1.§{DEL}=\x04u§[_loc2_] is §I&\x01§.§r`M8\x03§)
            {
               return param1.§{DEL}=\x04u§[_loc2_];
            }
            _loc2_++;
         }
         return null;
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
            if(mtGame.§w\x0b\x01o\x02§ != null)
            {
               mtGame.§w\x0b\x01o\x02§.visible = false;
            }
            _loc1_.draw(mtGame.§\x011wD§.stage);
            if(mtGame.§w\x0b\x01o\x02§ != null)
            {
               mtGame.§w\x0b\x01o\x02§.visible = true;
            }
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
         mtHist = mtCopy(_loc2_);
         mtPristine = new Dictionary();
         while(_loc3_ < mtHist.length)
         {
            mtPristine[mtHist[_loc3_]] = true;
            _loc3_++;
         }
         _loc3_ = 0;
         param1.§\x1e-\x02\x07\x01§ = mtQueue(0);
         mtPend = -1;
         mtStop = -1;
         mtPool = new Dictionary();
         mtWarmP = 0;
         mtWarmAt = 0;
         mtWarmK = 0;
         mtCps = [];
         mtWaves = [];
         // unknown while the battle is simulated: no end before the Winner entry exists
         mtWinIdx = mtSimDone ? mtTotal - 1 : 2147483647;
         mtSimTarget = -1;
         mtSpd = 1;
         mtAcc = 0;
         mtPaused = false;
         mtScreen = null;
         mtClosing = null;
         mtPauseWant = false;
         mtEnded = false;
         mtFast = false;
         mtIdx = -1;
         mtWave = 0;
         mtLast = -1;
         mtSeekTo = -1;
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
               ExternalInterface.addCallback("mtGoto",mtGoto);
               ExternalInterface.addCallback("mtShot",mtShot);
               ExternalInterface.addCallback("mtDump",mtDump);
               ExternalInterface.addCallback("mtHistStr",mtHistStr);
               ExternalInterface.addCallback("mtStopAt",mtStopAt);
               ExternalInterface.addCallback("mtSettle",mtSettle);
               ExternalInterface.addCallback("mtKfSize",mtKfSize);
               ExternalInterface.addCallback("mtAhead",mtAhead);
            }
            catch(_loc_e_:*)
            {
            }
         }
         // state 1 waits for the background image: still no state-2 frame after 10 s -> stuck
         mtInitAt = new Date().time;
         setTimeout(mtWaitCheck,10000,param1);
         // never lose mtReady: on an error, the keyframes not reached yet keep the logic's extras (mtKfX)
         try
         {
            mtShown();
         }
         catch(_loc_e_:*)
         {
         }
         mtStartsCalc();
         mtSimSt[1] = getTimer();
         mtSimOut();
         if(mtSimDone)
         {
            mtSimSt[2] = mtSimSt[1];
            mtReadyOut();
         }
         else
         {
            param1.§\x011wD§.addEventListener(Event.ENTER_FRAME,mtSimFrame,false,1);
         }
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
         if(mtPend < 0 && mtSeekTo < 0)
         {
            mtPauseSync(param1);
         }
         if(mtPend >= 0)
         {
            mtGoto(mtPend);
         }
         else if(mtSeekTo >= 0)
         {
            mtSeekStep(param1,_loc4_,_loc5_);
         }
         else if(param1.§w\x0b\x01o\x02§ != null)
         {
            // the pause screen (or its fade-out): one frame() per frame ticks it, as natively
            param1.§k\n/$\x03§();
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
               if(mtStop >= 0 && mtApplied(param1) >= mtStop)
               {
                  mtStop = -1;
                  mtPaused = true;
                  mtPauseOn(param1);
                  mtOut("mtPaused",[true]);
                  break;
               }
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
         // pre-warming, after this frame's work: never during playback (it would take its frame time); one trooper per frame while paused or once
         // the battle is over, none for 20 frames after a jump (its frames are being drawn)
         if(mtPend < 0 && mtSeekTo < 0 && mtWarmP < 2 && (mtPaused || param1.§HUgt\x03§))
         {
            if(mtWarmHold > 0)
            {
               mtWarmHold--;
            }
            else
            {
               // the troopers' tweens go to the Game's tween list, not to the pause screen's
               mtTm = §`\x0b\x01§.§{DEL}\f\x01§.§5\x1f\x01§.§\x1bxD1\x03§;
               §`\x0b\x01§.§{DEL}\f\x01§.§5\x1f\x01§.§\x1bxD1\x03§ = param1.§;\x1az\x01§;
               mtWarm();
               §`\x0b\x01§.§{DEL}\f\x01§.§5\x1f\x01§.§\x1bxD1\x03§ = mtTm;
               mtTm = null;
            }
         }
      }

      // one player frame of a seek whose synchronous part (mtGoto) ran out of time: frame() calls (fast flag on, Game clip
      // hidden) until the target is reached, within the frame's time budget (param2: start, param3: budget)
      public static function mtSeekStep(param1:§Q\btf§, param2:int, param3:int) : void
      {
         if(param1.§w\x0b\x01o\x02§ != null)
         {
            mtSeekEnd(param1);
            return;
         }
         while(mtApplied(param1) < mtSeekTo && !mtBlocked(param1))
         {
            mtUnwait(param1);
            mtHurry(param1);
            param1.§k\n/$\x03§();
            if(getTimer() - param2 >= param3)
            {
               break;
            }
         }
         if(mtApplied(param1) >= mtSeekTo || mtBlocked(param1))
         {
            mtSeekEnd(param1);
         }
      }

      // end of a seek: the Game clip shown again, mtProgress (and mtEnd past the Winner entry) sent
      public static function mtSeekEnd(param1:§Q\btf§) : void
      {
         mtSeekTo = -1;
         mtFast = mtSpd >= 8;
         mtAcc = 0;
         // mtHurry may have raised the clock's high-water mark past the clock: back to it, or the clock widget would
         // show its catch-up colours
         param1.§|H6s\x03§ = param1.§uN\x0ed§;
         param1.§I\x06ax\x03§ = null;
         if(!param1.§\x011wD§.visible)
         {
            param1.§\x011wD§.visible = true;
         }
         mtRate();
         if(mtApplied(param1) <= mtWinIdx)
         {
            mtEnded = false;
         }
         mtWave = 0;
         mtIdx = -2;
         if(mtPaused)
         {
            mtPauseWant = true;
         }
         mtReport(param1);
      }

      // --- keyframes. PC_PLAY_KF: called after each Battle.resolve() of the Game's state 0. Read-only: it only reads
      // the history and the troopers (getInfos(): new objects built from their fields, no random draw, no write).
      // A keyframe every 4 entries at least (resolve() steps add several at once) and after each NewWave (39).
      // Never throws into the Game's state 0: on an error, keyframes stop for this battle (only the empty one at 0 is
      // kept, so jumps replay from the start) and the battle goes on as computed.
      public static var mtKfOff:* = null;

      // --- lazy simulation (as BetterTrooper): the Game's state 0 resolves the battle 200 steps per frame until it is
      // over, then plays it. Here state 0 is left as soon as the history has an entry (mtKfGo returns true: the Game
      // takes the history and goes to state 1, mtInit runs); the battle is then resolved mtAheadN steps per frame by
      // mtSimFrame (an ENTER_FRAME listener of the Game clip, before the Game's own (priority 1): states 1 and 2), while it plays. Each
      // frame the new entries are copied to mtHist and appended to the Game's queue (unless the Winner was applied), the
      // keyframes' display state (mtShownStep), waves, checkpoints, wave starts are brought up to date, and the page gets
      // mtSim({events, complete, waves, starts, checkpoints}). mtReady comes once the battle is complete, as before.
      // A jump past the simulated entries waits (mtSimTarget, 30 steps per frame meanwhile) and is made once they exist.
      // Same resolve() calls in the same order: the history is the same, entry for entry.
      public static var mtSimB:* = null;
      public static var mtSimDone:Boolean = true;
      public static var mtAheadN:int = 4;
      public static var mtSimTarget:int = -1;
      public static var mtSimAt:int = -1;
      // timings: [first resolve, mtInit, complete (getTimer ms), ms in resolve() after mtInit, its steps, frames, ms syncing]
      public static var mtSimSt:Array = [-1,-1,-1,0,0,0,0];
      public static var mtSimSB:* = null;

      public static function mtKfGo(param1:*, param2:Boolean) : Boolean
      {
         if(param1 !== mtSimSB)
         {
            mtSimSB = param1;
            mtSimSt = [getTimer(),-1,-1,0,0,0,0];
         }
         mtKf(param1);
         if(param2)
         {
            mtSimB = null;
            mtSimDone = true;
            return true;
         }
         if(param1.§7\x13JZ\x03§.length > 0)
         {
            mtSimB = param1;
            mtSimDone = false;
            return true;
         }
         return false;
      }

      // page: steps of resolve() per frame while the battle is simulated (BetterTrooper's labNavAhead: 4, 2 on touch
      // screens, 30 while a jump waits)
      public static function mtAhead(param1:int) : void
      {
         mtAheadN = param1 < 1 ? 1 : (param1 > 200 ? 200 : param1);
      }

      public static function mtSimFrame(param1:*) : void
      {
         var _loc2_:* = mtSimB;
         var _loc3_:int = mtSimTarget >= 0 ? 2147483647 : mtAheadN;
         var _loc4_:int = 0;
         var _loc5_:Boolean = false;
         var _loc6_:int = 0;
         if(mtSimDone || _loc2_ == null || mtGame == null)
         {
            return;
         }
         _loc6_ = getTimer();
         // mtAheadN steps per frame, as BetterTrooper; while a jump waits: all the steps up to its entry in this frame
         // (at most the whole battle, ~0.3 s once, as the original state 0), then the jump in the same frame (mtSimSync)
         while(_loc4_ < _loc3_)
         {
            _loc4_++;
            _loc5_ = _loc2_.MnRZ();
            mtKf(_loc2_);
            if(_loc5_ || mtSimTarget >= 0 && _loc2_.§7\x13JZ\x03§.length >= mtSimTarget)
            {
               break;
            }
         }
         mtSimSt[3] += getTimer() - _loc6_;
         mtSimSt[4] += _loc4_;
         mtSimSt[5]++;
         _loc6_ = getTimer();
         mtSimSync(_loc5_);
         mtSimSt[6] += getTimer() - _loc6_;
         if(mtSimDone)
         {
            mtSimSt[2] = getTimer();
         }
      }

      public static function mtSimSync(param1:Boolean) : void
      {
         var _loc2_:Array = mtSimB.§7\x13JZ\x03§;
         var _loc3_:§Q\btf§ = mtGame;
         var _loc4_:int = mtHist.length;
         var _loc5_:Boolean = mtApplied(_loc3_) <= mtWinIdx;
         var _loc6_:* = null;
         var _loc7_:int = 0;
         var _loc8_:int = 0;
         while(_loc4_ < _loc2_.length)
         {
            _loc6_ = mtCopy(_loc2_[_loc4_]);
            mtHist.push(_loc6_);
            mtPristine[_loc6_] = true;
            _loc7_ = int(_loc6_["An%6"][")-Z\x19\x01"]);
            if(_loc7_ == 38)
            {
               mtCps.push(_loc4_);
            }
            else if(_loc7_ == 39)
            {
               mtWaves.push(_loc4_);
            }
            else if(_loc7_ == 34)
            {
               mtWinIdx = _loc4_;
            }
            // the queue is a suffix of mtHist (Game's own, a restore's), but once the Winner is applied: it empties it
            if(_loc5_)
            {
               _loc3_.§\x1e-\x02\x07\x01§.push(_loc6_);
            }
            _loc4_++;
            _loc8_++;
         }
         mtTotal = mtHist.length;
         try
         {
            mtShownStep();
         }
         catch(_loc_e_:*)
         {
         }
         mtStartsCalc();
         if(param1)
         {
            mtSimDone = true;
            mtSimB = null;
            if(mtWinIdx > mtTotal)
            {
               mtWinIdx = mtTotal - 1;
            }
            _loc3_.§\x011wD§.removeEventListener(Event.ENTER_FRAME,mtSimFrame);
            // the pre-warm goes over the keyframes again, the last ones included
            mtWarmP = 0;
            mtWarmAt = 0;
            mtWarmK = 0;
         }
         if(_loc8_ > 0 || param1)
         {
            mtSimOut();
         }
         if(param1)
         {
            mtReadyOut();
         }
         if(mtSimTarget >= 0 && (mtTotal >= mtSimTarget || mtSimDone))
         {
            _loc7_ = mtSimTarget;
            mtSimTarget = -1;
            mtGoto(_loc7_);
         }
      }

      public static function mtSimOut() : void
      {
         mtOut("mtSim",[{
            "events":mtTotal,
            "complete":mtSimDone,
            "waves":mtWaves,
            "starts":mtStarts,
            "checkpoints":mtCps
         }]);
      }

      public static function mtReadyOut() : void
      {
         mtOut("mtReady",[{
            "total":mtTotal,
            "checkpoints":mtCps,
            "waves":mtWaves,
            "starts":mtStarts
         }]);
      }

      // per wave: the history index of its first keyframe after the NewWave (a keyframe not taken yet: the NewWave's)
      public static function mtStartsCalc() : void
      {
         var _loc1_:int = 0;
         var _loc2_:int = 0;
         mtStarts = [];
         while(_loc1_ < mtWaves.length)
         {
            _loc2_ = 0;
            while(_loc2_ < mtKfs.length && int(mtKfs[_loc2_].i) <= int(mtWaves[_loc1_]))
            {
               _loc2_++;
            }
            mtStarts.push(_loc2_ < mtKfs.length ? int(mtKfs[_loc2_].i) : int(mtWaves[_loc1_]));
            _loc1_++;
         }
      }

      public static function mtKf(param1:§P!L/\x02§.§\x0b\x0eNO§) : void
      {
         if(mtKfOff === param1)
         {
            return;
         }
         try
         {
            mtKfBody(param1);
         }
         catch(_loc_e_:*)
         {
            mtKfOff = param1;
            mtKfB = param1;
            mtKfs = [{
               "i":0,
               "t":[],
               "x":[],
               "d":[],
               "dx":[],
               "g":[]
            }];
         }
      }

      public static function mtKfBody(param1:§P!L/\x02§.§\x0b\x0eNO§) : void
      {
         var _loc2_:Array = param1.§7\x13JZ\x03§;
         var _loc3_:Boolean = false;
         var _loc4_:int = 0;
         var _loc5_:* = null;
         var _loc6_:Object = {};
         var _loc7_:Array = null;
         var _loc8_:int = 0;
         if(param1 !== mtKfB)
         {
            mtKfB = param1;
            mtKfs = [{
               "i":0,
               "t":[],
               "x":[],
               "d":[],
               "dx":[],
               "g":[]
            }];
            mtKfN = 0;
            mtKfScan = 0;
            mtKfFall = new Dictionary();
            mtKfDead = new Dictionary();
         }
         while(mtKfScan < _loc2_.length)
         {
            if(int(_loc2_[mtKfScan]["An%6"][")-Z\x19\x01"]) == 39)
            {
               _loc3_ = true;
            }
            mtFly(_loc2_[mtKfScan]["An%6"],_loc6_,0);
            mtKfScan++;
         }
         _loc4_ = 0;
         while(_loc4_ < param1.§`1\x1f*\x02§.length)
         {
            _loc5_ = param1.§`1\x1f*\x02§[_loc4_];
            _loc4_++;
            if(_loc5_ is §P!L/\x02§.§59=F\x03§ && !_loc5_.§s*\x12\x1f§())
            {
               mtKfFall[_loc5_] = int(_loc5_.§=\x01XR\x02§.§)-Z\x19\x01§) == 4;
               mtKfDead[_loc5_] = false;
            }
         }
         _loc4_ = 0;
         while(_loc4_ < param1.§p\x05e\x06\x01§.length)
         {
            _loc7_ = param1.§p\x05e\x06\x01§[_loc4_].§p\x18\x16j§;
            _loc8_ = 0;
            while(_loc8_ < _loc7_.length)
            {
               _loc5_ = _loc7_[_loc8_];
               _loc8_++;
               if(mtKfDead[_loc5_] !== true)
               {
                  mtKfDead[_loc5_] = true;
                  if(_loc6_[int(_loc5_.§5E[\x1d§["7X\x01"])] === true)
                  {
                     mtKfFall[_loc5_] = true;
                  }
               }
            }
            _loc4_++;
         }
         if((_loc2_.length - mtKfN >= 4 || _loc3_ || param1.§\x1e1\\J\x01§ != null) && _loc2_.length > mtKfN)
         {
            mtKfN = _loc2_.length;
            mtKfs.push(mtKfTake(param1,mtKfN));
         }
      }

      // the ids of the hits (plain objects with a tid "\x1e,d\x01" and effects "iE!m\x02") in param1 that knock their
      // target flying (effect 2), into param2
      public static function mtFly(param1:*, param2:Object, param3:int) : void
      {
         var _loc4_:* = null;
         var _loc5_:int = 0;
         var _loc6_:* = null;
         var _loc7_:Boolean = false;
         if(param1 === null || param1 === undefined || param3 > 8 || param1 is String || param1 is Number || param1 is Boolean)
         {
            return;
         }
         if(param1 is Array)
         {
            while(_loc5_ < param1.length)
            {
               mtFly(param1[_loc5_],param2,param3 + 1);
               _loc5_++;
            }
            return;
         }
         if(Object(param1).constructor === Object)
         {
            _loc4_ = param1["iE!m\x02"];
            if(param1["\x1e,d\x01"] != null && _loc4_ is Array)
            {
               while(_loc5_ < _loc4_.length)
               {
                  _loc6_ = _loc4_[_loc5_];
                  _loc5_++;
                  try
                  {
                     _loc7_ = _loc6_ != null && _loc6_.__enum__ === true && int(_loc6_[")-Z\x19\x01"]) == 2;
                  }
                  catch(_loc_e_:*)
                  {
                     _loc7_ = false;
                  }
                  if(_loc7_)
                  {
                     param2[int(param1["\x1e,d\x01"])] = true;
                  }
               }
            }
            for(_loc6_ in param1)
            {
               if(_loc6_ != "5E[\x1d")
               {
                  mtFly(param1[_loc6_],param2,param3 + 1);
               }
            }
            return;
         }
         try
         {
            _loc7_ = param1.__enum__ === true && param1["7\x02@d\x02"] != null;
         }
         catch(_loc_e_:*)
         {
            _loc7_ = false;
         }
         if(_loc7_)
         {
            mtFly(param1["7\x02@d\x02"],param2,param3 + 1);
         }
      }

      // The display keeps statuses, wounds and the "healed" flag of its own, which the logic's do not always match (a
      // display trooper keeps the wounds of a heal and the statuses no entry removed, the logic does not; the logic can
      // hold a status no entry showed). mtShown replays them from the history up to each keyframe, by the display's own
      // rules, and puts them in the keyframes' extras (x and dx, fields 1-3):
      // - statuses: added by BattleMsg 22 (its tid) and by hit effect 12, removed by 23 (its tid) and by 13 (antidote:
      //   POISON off its target);
      // - wounds: the body location of every hit whose damage is > 0 and type not MISS (9);
      // - healed: BattleMsg 12 (heal: its target), 17 with skill 77 (team heal: its ids), 14 with skill 90 (its hits'
      //   targets). A hit's effects after a weapon caught (6) or a hit passed on (5) are not applied (the display returns).
      // An id can come back as another trooper (no weapon in common, mtShownKf): that one starts from a blank state.
      // incremental (the history grows while the battle is simulated): states mtShD, put-aside ones mtShA, next entry
      // mtShI, next keyframe mtShK, history index of the previous keyframe mtShP
      public static var mtShD:Dictionary = new Dictionary();
      public static var mtShA:Array = [];
      public static var mtShI:int = 0;
      public static var mtShK:int = 0;
      public static var mtShP:int = 0;

      public static function mtShown() : void
      {
         mtShD = new Dictionary();
         mtShA = [];
         mtShI = 0;
         mtShK = 0;
         mtShP = 0;
         mtShownStep();
      }

      // the keyframes and entries not done yet (a keyframe's index is the history's length when it was taken: never
      // above mtHist's, and increasing)
      public static function mtShownStep() : void
      {
         while(true)
         {
            while(mtShK < mtKfs.length && int(mtKfs[mtShK].i) <= mtShI)
            {
               mtShownKf(mtKfs[mtShK],mtShD,mtShA,mtShP);
               mtShP = mtShI;
               mtShK++;
            }
            if(mtShI >= mtHist.length)
            {
               break;
            }
            mtShownE(mtShD,mtHist[mtShI]);
            mtShI++;
         }
      }

      // history entry param2 on the display states param1
      public static function mtShownE(param1:Dictionary, param2:Object) : void
      {
         var _loc4_:* = param2["An%6"];
         var _loc5_:int = int(_loc4_[")-Z\x19\x01"]);
         var _loc6_:Array = _loc4_["7\x02@d\x02"];
         var _loc7_:Array = [];
         var _loc8_:int = int(param2["\x1e,d\x01"]);
         var _loc9_:* = null;
         var _loc10_:* = null;
         var _loc11_:int = 0;
         var _loc12_:* = null;
         if(_loc5_ == 22)
         {
            mtSt(param1,_loc8_,_loc6_[0],true);
         }
         else if(_loc5_ == 23)
         {
            mtSt(param1,_loc8_,_loc6_[0],false);
         }
         else if(_loc5_ == 13)
         {
            mtSt(param1,int(_loc6_[0]),§q\x18\tv\x02§.§;GG(\x02§,false);
         }
         else if(_loc5_ == 12)
         {
            mtSh(param1,int(_loc6_[0])).h = true;
         }
         else if(_loc5_ == 17 && int(_loc6_[0][")-Z\x19\x01"]) == 77)
         {
            while(_loc11_ < _loc6_[1].length)
            {
               mtSh(param1,int(_loc6_[1][_loc11_])).h = true;
               _loc11_++;
            }
         }
         mtHits(_loc6_,_loc7_,0);
         _loc11_ = 0;
         while(_loc11_ < _loc7_.length)
         {
            _loc9_ = _loc7_[_loc11_];
            _loc11_++;
            _loc12_ = mtSh(param1,int(_loc9_["\x1e,d\x01"]));
            if(_loc5_ == 14 && int(_loc6_[0][")-Z\x19\x01"]) == 90)
            {
               _loc12_.h = true;
            }
            if(_loc9_["\x02\x127\x01"] != null && int(_loc9_["w;\t'\x02"]) > 0 && int(_loc9_["An%6"][")-Z\x19\x01"]) != 9)
            {
               _loc12_.j.push(_loc9_["\x02\x127\x01"]);
            }
            _loc10_ = _loc9_["iE!m\x02"];
            _loc8_ = 0;
            while(_loc10_ != null && _loc8_ < _loc10_.length)
            {
               // the display stops at a weapon caught (6) or a hit passed on (5, the nested hit counts as a hit)
               if(_loc10_[_loc8_] != null && (int(_loc10_[_loc8_][")-Z\x19\x01"]) == 5 || int(_loc10_[_loc8_][")-Z\x19\x01"]) == 6))
               {
                  break;
               }
               if(_loc10_[_loc8_] != null && int(_loc10_[_loc8_][")-Z\x19\x01"]) == 12)
               {
                  mtSt(param1,int(_loc9_["\x1e,d\x01"]),_loc10_[_loc8_]["7\x02@d\x02"][0],true);
               }
               _loc8_++;
            }
         }
      }

      // display state of trooper param2: {s: statuses, j: wounds, h: healed, w: weapon ids of that trooper}
      public static function mtSh(param1:Dictionary, param2:int) : Object
      {
         if(param1[param2] == null)
         {
            param1[param2] = {
               "s":[],
               "j":[],
               "h":false,
               "w":null
            };
         }
         return param1[param2];
      }

      public static function mtSt(param1:Dictionary, param2:int, param3:*, param4:Boolean) : void
      {
         var _loc5_:Array = mtSh(param1,param2).s;
         var _loc6_:int = _loc5_.indexOf(param3);
         if(param4 && _loc6_ < 0)
         {
            _loc5_.push(param3);
         }
         else if(!param4 && _loc6_ >= 0)
         {
            _loc5_.splice(_loc6_,1);
         }
      }

      // the weapon ids of keyframe info param1
      public static function mtWids(param1:Object) : Array
      {
         var _loc2_:Array = [];
         var _loc3_:Array = param1["\x1dI\x02\r\x03"];
         var _loc4_:int = 0;
         while(_loc3_ != null && _loc4_ < _loc3_.length)
         {
            _loc2_.push(int(_loc3_[_loc4_]["7X\x01"]));
            _loc4_++;
         }
         return _loc2_;
      }

      public static function mtWcommon(param1:Array, param2:Array) : Boolean
      {
         var _loc3_:int = 0;
         if(param1.length == 0 && param2.length == 0)
         {
            return true;
         }
         while(_loc3_ < param1.length)
         {
            if(param2.indexOf(param1[_loc3_]) >= 0)
            {
               return true;
            }
            _loc3_++;
         }
         return false;
      }

      // the display state of the trooper of info param4 at keyframe param1: param2's for its id, unless the trooper there
      // is another one (no weapon in common): then an earlier one put aside in param3, or a new one, replayed from the
      // previous keyframe (history index param5), where it was not yet there
      public static function mtShownOf(param1:Object, param2:Dictionary, param3:Array, param4:Object, param5:int) : Object
      {
         var _loc6_:int = int(param4["5E[\x1d"]["7X\x01"]);
         var _loc7_:Array = mtWids(param4);
         var _loc8_:Object = mtSh(param2,_loc6_);
         var _loc9_:int = 0;
         var _loc10_:Dictionary = null;
         if(_loc8_.w == null)
         {
            _loc8_.w = _loc7_;
            return _loc8_;
         }
         if(mtWcommon(_loc8_.w,_loc7_))
         {
            return _loc8_;
         }
         while(_loc9_ < param3.length)
         {
            if(int(param3[_loc9_].id) == _loc6_ && mtWcommon(param3[_loc9_].w,_loc7_))
            {
               return param3[_loc9_];
            }
            _loc9_++;
         }
         _loc8_.id = _loc6_;
         param3.push(_loc8_);
         _loc10_ = new Dictionary();
         _loc9_ = param5;
         while(_loc9_ < int(param1.i))
         {
            mtShownE(_loc10_,mtHist[_loc9_]);
            _loc9_++;
         }
         _loc8_ = mtSh(_loc10_,_loc6_);
         _loc8_.w = _loc7_;
         param2[_loc6_] = _loc8_;
         return _loc8_;
      }

      public static function mtShownKf(param1:Object, param2:Dictionary, param3:Array, param4:int) : void
      {
         var _loc3_:int = 0;
         var _loc4_:Object = null;
         while(_loc3_ < param1.t.length)
         {
            _loc4_ = mtShownOf(param1,param2,param3,param1.t[_loc3_],param4);
            param1.x[_loc3_][1] = _loc4_.s.concat();
            param1.x[_loc3_][2] = _loc4_.j.concat();
            param1.x[_loc3_][3] = _loc4_.h;
            _loc3_++;
         }
         _loc3_ = 0;
         while(_loc3_ < param1.d.length)
         {
            _loc4_ = mtShownOf(param1,param2,param3,param1.d[_loc3_],param4);
            param1.dx[_loc3_][1] = _loc4_.s.concat();
            param1.dx[_loc3_][2] = _loc4_.j.concat();
            param1.dx[_loc3_][3] = _loc4_.h;
            _loc3_++;
         }
      }

      // the hits (plain objects with a tid "\x1e,d\x01" and effects "iE!m\x02") in param1, nested ones included
      public static function mtHits(param1:*, param2:Array, param3:int) : void
      {
         var _loc4_:int = 0;
         var _loc5_:* = null;
         var _loc6_:Boolean = false;
         if(param1 === null || param1 === undefined || param3 > 8 || param1 is String || param1 is Number || param1 is Boolean)
         {
            return;
         }
         if(param1 is Array)
         {
            while(_loc4_ < param1.length)
            {
               mtHits(param1[_loc4_],param2,param3 + 1);
               _loc4_++;
            }
            return;
         }
         if(Object(param1).constructor === Object)
         {
            if(param1["\x1e,d\x01"] != null && param1["iE!m\x02"] is Array)
            {
               param2.push(param1);
            }
            for(_loc5_ in param1)
            {
               if(_loc5_ != "5E[\x1d")
               {
                  mtHits(param1[_loc5_],param2,param3 + 1);
               }
            }
            return;
         }
         try
         {
            _loc6_ = param1.__enum__ === true && param1["7\x02@d\x02"] != null;
         }
         catch(_loc_e_:*)
         {
            _loc6_ = false;
         }
         if(_loc6_)
         {
            mtHits(param1["7\x02@d\x02"],param2,param3 + 1);
         }
      }

      // the battle's state once param2 entries are computed: infos and extra state of the troopers on the field, infos
      // of this wave's dead (the teams' dead lists, emptied by NewWave), weapons lying on squares
      public static function mtKfTake(param1:§P!L/\x02§.§\x0b\x0eNO§, param2:int) : Object
      {
         var _loc3_:Array = [];
         var _loc4_:Array = [];
         var _loc5_:Array = [];
         var _loc6_:Array = [];
         var _loc11_:Array = [];
         var _loc7_:int = 0;
         var _loc8_:int = 0;
         var _loc9_:* = null;
         var _loc10_:Array = null;
         _loc10_ = param1.§`1\x1f*\x02§;
         while(_loc7_ < _loc10_.length)
         {
            _loc9_ = _loc10_[_loc7_];
            _loc7_++;
            if(_loc9_ is §P!L/\x02§.§59=F\x03§ && !_loc9_.§s*\x12\x1f§())
            {
               _loc3_.push(_loc9_.§WU|\x04§());
               _loc4_.push(mtKfX(_loc9_));
            }
         }
         _loc7_ = 0;
         while(_loc7_ < param1.§p\x05e\x06\x01§.length)
         {
            _loc10_ = param1.§p\x05e\x06\x01§[_loc7_].§p\x18\x16j§;
            _loc8_ = 0;
            while(_loc8_ < _loc10_.length)
            {
               _loc5_.push(_loc10_[_loc8_].§WU|\x04§());
               _loc9_ = mtKfX(_loc10_[_loc8_]);
               if(mtKfFall[_loc10_[_loc8_]] === true)
               {
                  _loc9_[0] = 4;
               }
               _loc11_.push(_loc9_);
               _loc8_++;
            }
            _loc7_++;
         }
         _loc7_ = 0;
         _loc10_ = param1.§UrNA\x01§;
         while(_loc7_ < _loc10_.length)
         {
            _loc9_ = _loc10_[_loc7_];
            _loc7_++;
            _loc8_ = 0;
            while(_loc8_ < _loc9_.§\x1dI\x02\r\x03§.length)
            {
               _loc6_.push([_loc9_.§v\x01§,_loc9_.§l\x01§,_loc9_.§\x1dI\x02\r\x03§[_loc8_].§*\x1f\n$§()]);
               _loc8_++;
            }
         }
         return {
            "i":param2,
            "t":_loc3_,
            "x":_loc4_,
            "d":_loc5_,
            "dx":_loc11_,
            "g":_loc6_
         };
      }

      // [state index (TrooperState), status enums, body locations hit, healed, vehicle hp or -1]
      public static function mtKfX(param1:*) : Array
      {
         var _loc2_:Array = [];
         var _loc3_:int = 0;
         while(_loc3_ < param1.§\x13fT$\x03§.length)
         {
            _loc2_.push(param1.§\x13fT$\x03§[_loc3_].§o\x1a\x01§);
            _loc3_++;
         }
         return [int(param1.§=\x01XR\x02§.§)-Z\x19\x01§),_loc2_,param1.§3\x12\x06c\x03§.concat(),param1.§XEC3\x03§,param1.§J@`r§ == null ? -1 : int(param1.§J@`r§.§\x12?g-§)];
      }

      // deep copy of history data: arrays, plain objects (trooper data "5E[\x1d" shared), enums with parameters rebuilt;
      // other class instances (logic objects, parameterless enums) shared
      public static function mtCopy(param1:*) : *
      {
         var _loc2_:* = null;
         var _loc3_:* = null;
         var _loc4_:int = 0;
         var _loc5_:Boolean = false;
         var _loc6_:Class = null;
         if(param1 === null || param1 === undefined || !(param1 is Object) || param1 is String || param1 is Number || param1 is Boolean)
         {
            return param1;
         }
         if(param1 is Array)
         {
            _loc2_ = [];
            while(_loc4_ < param1.length)
            {
               _loc2_.push(mtCopy(param1[_loc4_]));
               _loc4_++;
            }
            return _loc2_;
         }
         if(Object(param1).constructor === Object)
         {
            _loc2_ = {};
            for(_loc3_ in param1)
            {
               _loc2_[_loc3_] = _loc3_ == "5E[\x1d" ? param1[_loc3_] : mtCopy(param1[_loc3_]);
            }
            return _loc2_;
         }
         try
         {
            _loc5_ = param1.__enum__ === true && param1["7\x02@d\x02"] != null;
         }
         catch(_loc_e_:*)
         {
            _loc5_ = false;
         }
         if(_loc5_)
         {
            _loc6_ = Object(param1).constructor as Class;
            return new _loc6_(param1["\x14s\x1e\x01"],param1[")-Z\x19\x01"],mtCopy(param1["7\x02@d\x02"]));
         }
         return param1;
      }

      // The Game's queue from history index param1: mtHist's entries. The display changes the entries it plays (deploys
      // pop their infos, CheckPoint and deploy infos end up in the troopers they create, BattleMsg 41/42 arrays are
      // emptied, misses get 0 damage): mtFresh replaces the head of the queue with copies before each frame(), so that
      // mtHist stays as computed for the next restores.
      public static var mtPristine:Dictionary = new Dictionary();

      public static function mtQueue(param1:int) : Array
      {
         return mtHist.slice(param1);
      }

      // the first 16 entries of the queue (at most one step starts per tick, at most 16 ticks per frame(): the native
      // fast-forward key) are copies
      public static function mtFresh(param1:§Q\btf§) : void
      {
         var _loc2_:Array = param1.§\x1e-\x02\x07\x01§;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_.length && _loc3_ < 16)
         {
            if(mtPristine[_loc2_[_loc3_]] === true)
            {
               _loc2_[_loc3_] = mtCopy(_loc2_[_loc3_]);
            }
            _loc3_++;
         }
      }

      // Puts the Game in the state of keyframe param2: current step and actions skipped (ylcZ, as the native checkpoint
      // skip does), the Winner action and its banner and panel removed, tweens (but the leader markers' singleton),
      // hit-stop, weapons and items on the ground, particles and the end of battle removed; troopers reused (mtReusable)
      // or destroyed; queue from the keyframe, clock at its last entry; troopers created from copies of the keyframe
      // infos as the CheckPoint rebuild (§;`b\x1c\x02§) does for absent ones; then the extra state (statuses, wounds,
      // poses, vehicle hp), this wave's dead, weapons on the ground and the side panels (last PlayerStatus of each side
      // before the keyframe).
      public static function mtRestore(param1:§Q\btf§, param2:Object, param3:int = -1) : void
      {
         var _loc3_:Array = null;
         var _loc4_:int = 0;
         var _loc5_:* = null;
         var _loc6_:* = null;
         var _loc7_:Array = null;
         var _loc8_:int = 0;
         var _loc9_:int = int(param2.i);
         var _loc10_:int = getTimer();
         var _loc11_:int = 0;
         var _loc12_:Dictionary = new Dictionary();
         if(param1.§^h'l\x02§ != null)
         {
            param1.§^h'l\x02§.aGx2();
         }
         _loc3_ = param1.§{DEL}=\x04u§.concat();
         while(_loc4_ < _loc3_.length)
         {
            _loc5_ = _loc3_[_loc4_];
            _loc4_++;
            if(_loc5_ is §I&\x01§.§r`M8\x03§)
            {
               if(_loc5_.§E_i\b§ != null && _loc5_.§E_i\b§.parent != null)
               {
                  _loc5_.§E_i\b§.parent.removeChild(_loc5_.§E_i\b§);
               }
               if(_loc5_.§E't&\x01§ != null && _loc5_.§E't&\x01§.parent != null)
               {
                  _loc5_.§E't&\x01§.parent.removeChild(_loc5_.§E't&\x01§);
               }
               _loc5_.aGx2();
            }
            else
            {
               _loc5_.ylcZ();
            }
         }
         _loc3_ = param1.§{DEL}=\x04u§.concat();
         _loc4_ = 0;
         while(_loc4_ < _loc3_.length)
         {
            if(!_loc3_[_loc4_].§\x06TY0§)
            {
               _loc3_[_loc4_].aGx2();
            }
            _loc4_++;
         }
         param1.§{DEL}=\x04u§ = [];
         param1.§^h'l\x02§ = null;
         _loc3_ = param1.§;\x1az\x01§.§Te\x10\x01§.concat();
         _loc4_ = 0;
         while(_loc4_ < _loc3_.length)
         {
            if(!(_loc3_[_loc4_] is §{DEL}\f\x01§.§*\x17Z\x10§) && !_loc3_[_loc4_].§Qg}\x07§)
            {
               _loc3_[_loc4_].aGx2();
            }
            _loc4_++;
         }
         param1.§~Y\x12(\x01§ = [];
         _loc7_ = [];
         _loc3_ = param1.§`1\x1f*\x02§.concat();
         _loc4_ = 0;
         while(_loc4_ < _loc3_.length)
         {
            _loc5_ = _loc3_[_loc4_];
            _loc6_ = mtInfo(param2.t,int(_loc5_.§;\f\x01§.§5E[\x1d§["7X\x01"]));
            if(_loc6_ != null && mtReusable(_loc5_,_loc6_) || _loc5_.§Qg}\x07§ && !_loc5_.§\x06TY0§ && _loc5_.§n*L%\x01§ == null && mtSameBody(_loc5_,mtInfo(param2.d,int(_loc5_.§;\f\x01§.§5E[\x1d§["7X\x01"]))))
            {
               _loc7_.push(_loc5_);
            }
            else
            {
               mtStash(_loc5_);
            }
            _loc4_++;
         }
         param1.§`1\x1f*\x02§ = _loc7_.concat();
         _loc3_ = param1.§\x1dI\x02\r\x03§.concat();
         _loc4_ = 0;
         while(_loc4_ < _loc3_.length)
         {
            _loc3_[_loc4_].aGx2();
            _loc4_++;
         }
         param1.§\x1dI\x02\r\x03§ = [];
         param1.§\\\x123a\x03§ = [];
         _loc3_ = param1.§F;R\x12\x01§.§\x1fs\x0ev§.concat();
         _loc4_ = 0;
         while(_loc4_ < _loc3_.length)
         {
            if(_loc7_.indexOf(_loc3_[_loc4_]) < 0)
            {
               _loc3_[_loc4_].aGx2();
            }
            _loc4_++;
         }
         param1.§F;R\x12\x01§.§\x1fs\x0ev§ = _loc7_.concat();
         param1.§HUgt\x03§ = false;
         mtCt(param1.§F;R\x12\x01§.§\x011wD§);
         if(param1.§-\x05p,\x03§.alpha != 1)
         {
            param1.§-\x05p,\x03§.alpha = 1;
         }
         _loc4_ = 0;
         while(_loc4_ < param1.§a]e\x1b\x02§.length)
         {
            if(param1.§a]e\x1b\x02§[_loc4_].§$*w\x01§.alpha != 1)
            {
               param1.§a]e\x1b\x02§[_loc4_].§$*w\x01§.alpha = 1;
            }
            _loc4_++;
         }
         _loc4_ = _loc9_ > 0 ? int(mtHist[_loc9_ - 1]["uN\x0ed"]) : 0;
         param1.§uN\x0ed§ = _loc4_;
         param1.§|H6s\x03§ = _loc4_;
         param1.§\x02^\x10}\x03§ = 0;
         param1.§I\x06ax\x03§ = null;
         param1.§\x1e-\x02\x07\x01§ = mtQueue(_loc9_);
         mtProfR.push(getTimer() - _loc10_);
         _loc10_ = getTimer();
         _loc3_ = mtCopy(param2.t);
         _loc4_ = 0;
         while(_loc4_ < _loc3_.length)
         {
            _loc5_ = param1.§;|^W§(int(_loc3_[_loc4_]["5E[\x1d"]["7X\x01"]));
            if(_loc5_ != null)
            {
               mtReuse(_loc5_,_loc3_[_loc4_],param2.x[_loc4_]);
               _loc12_[_loc5_] = true;
            }
            else
            {
               _loc5_ = mtUnstash(int(_loc3_[_loc4_]["5E[\x1d"]["7X\x01"]),_loc3_[_loc4_],false);
               if(_loc5_ != null)
               {
                  mtReuse(_loc5_,_loc3_[_loc4_],param2.x[_loc4_]);
                  _loc12_[_loc5_] = true;
               }
               else
               {
                  param1.§y#;B\x01§(_loc3_[_loc4_]);
                  _loc11_++;
               }
            }
            _loc4_++;
         }
         param1.§F;R\x12\x01§.§qp[q\x02§();
         mtProfR.push(getTimer() - _loc10_,_loc11_,_loc3_.length - _loc11_);
         _loc10_ = getTimer();
         _loc4_ = 0;
         while(_loc4_ < param2.x.length)
         {
            _loc5_ = param1.§;|^W§(int(param2.t[_loc4_]["5E[\x1d"]["7X\x01"]));
            mtExtra(_loc5_,param2.x[_loc4_],true,_loc12_[_loc5_] !== true);
            _loc4_++;
         }
         mtProfR.push(getTimer() - _loc10_);
         _loc10_ = getTimer();
         _loc4_ = 0;
         while(_loc4_ < param2.d.length)
         {
            _loc5_ = param1.§;|^W§(int(param2.d[_loc4_]["5E[\x1d"]["7X\x01"]));
            if(_loc5_ != null)
            {
               // a body kept on the field: the statuses shown are the keyframe's (mtShown)
               if(_loc5_.§Qg}\x07§)
               {
                  mtExtra(_loc5_,param2.dx[_loc4_],false);
               }
               _loc4_++;
               continue;
            }
            _loc5_ = mtUnstash(int(param2.d[_loc4_]["5E[\x1d"]["7X\x01"]),param2.d[_loc4_],true);
            if(_loc5_ != null)
            {
               mtExtra(_loc5_,param2.dx[_loc4_],false);
               _loc4_++;
               continue;
            }
            _loc5_ = param1.§y#;B\x01§(mtCopy(param2.d[_loc4_]));
            mtExtra(_loc5_,param2.dx[_loc4_],false);
            _loc5_.§\x16mf\x01§();
            _loc5_.§PNcV\x01§(int(param2.dx[_loc4_][0]) == 4 ? §/U3W§.§ohzk\x03§ : §/U3W§.§?u{T\x01§);
            mtFf(_loc5_);
            _loc4_++;
         }
         mtProfR.push(getTimer() - _loc10_,param2.d.length);
         _loc10_ = getTimer();
         _loc4_ = 0;
         while(_loc4_ < param2.g.length)
         {
            _loc7_ = param2.g[_loc4_];
            _loc5_ = new §z&\x01§.§lv\x0f0§(mtCopy(_loc7_[2]));
            _loc6_ = §n#\x07\f§.§\x12X\x0f\x15\x01§(_loc7_[0],_loc7_[1]);
            _loc5_.§L\x16;=§(_loc6_["v\x01"],_loc6_["l\x01"],0);
            _loc5_.§5%um\x01§ = true;
            _loc4_++;
         }
         param1.§F;R\x12\x01§.§qp[q\x02§();
         _loc4_ = 0;
         while(_loc4_ < param1.§a]e\x1b\x02§.length)
         {
            _loc5_ = null;
            _loc8_ = (param3 >= 0 && param3 < _loc9_ ? param3 : _loc9_) - 1;
            while(_loc8_ >= 0)
            {
               _loc6_ = mtHist[_loc8_]["An%6"];
               if(int(_loc6_[")-Z\x19\x01"]) == 40 && int(_loc6_["7\x02@d\x02"][0]) == _loc4_)
               {
                  _loc5_ = _loc6_["7\x02@d\x02"][1];
                  break;
               }
               _loc8_--;
            }
            mtPanel(param1.§a]e\x1b\x02§[_loc4_],_loc5_);
            _loc4_++;
         }
         mtProfR.push(getTimer() - _loc10_);
      }

      // The animation clips of the troopers share pre-rendered frames by skin (§;io&§.§n6?\f\x02§, reference counted,
      // disposed when the count falls to 0 unless their keep flag §\x10)L\x13\x02§ is set). mtKeep sets that flag on the
      // skin of every trooper on the field (each tick, mtClips): a skin is rendered once per battle, a restore that
      // recreates a trooper finds its frames ready.
      public static function mtKeep() : void
      {
         var _loc1_:Array = mtGame == null ? null : mtGame.§`1\x1f*\x02§;
         var _loc2_:int = 0;
         var _loc3_:* = null;
         if(_loc1_ == null)
         {
            return;
         }
         while(_loc2_ < _loc1_.length)
         {
            _loc3_ = _loc1_[_loc2_].§\x05\x03\x1a\x01§;
            _loc2_++;
            if(_loc3_ != null && _loc3_.§=q2\x0e\x01§ != null)
            {
               _loc3_.§=q2\x0e\x01§.§\x10)L\x13\x02§ = true;
            }
         }
      }

      // Pool of display troopers taken off the field by restores (id -> trooper): detached from the scene, the troopers'
      // list, the particles and the clips the Game advances and renders, otherwise intact (skin, clips). A later restore
      // that needs the same trooper reattaches it (mtUnstash) and resets it with mtReuse, or keeps it as a body, instead
      // of creating one (building a skin is the costly part of a restore). Leader
      // markers are hidden meanwhile (mtMark); fading troopers are destroyed as before.
      public static var mtPool:Dictionary = new Dictionary();
      // [stashed, reattached, destroyed instead of stashed, pooled but unusable]
      public static var mtPoolN:Array = [0,0,0,0];

      public static function mtStash(param1:*) : void
      {
         var _loc2_:int = int(param1.§;\f\x01§.§5E[\x1d§["7X\x01"]);
         var _loc3_:Array = mtPool[_loc2_];
         // the vehicle's hover tween (§''R?§, type 3) points at the trooper: never left running
         if(param1.§''R?§ != null)
         {
            param1.§''R?§.aGx2();
            param1.§''R?§ = null;
         }
         if(param1.§\x05\x03\x1a\x01§ != null)
         {
            param1.§\x05\x03\x1a\x01§.§;x\x19\x07\x02§();
         }
         if(param1.§n*L%\x01§ != null || param1.§\x06TY0§ || param1.§\x10\x1e\x01§ == null || param1.§W\x19\x1bT\x03§ != null || _loc3_ != null && _loc3_.length >= 4)
         {
            mtPoolN[2]++;
            param1.aGx2();
            return;
         }
         if(_loc3_ == null)
         {
            _loc3_ = mtPool[_loc2_] = [];
         }
         mtGame.§`1\x1f*\x02§.§fl@@\x02§(param1);
         mtGame.§F;R\x12\x01§.§\x1fs\x0ev§.§fl@@\x02§(param1);
         if(param1.§\x011wD§.parent != null)
         {
            param1.§\x011wD§.parent.removeChild(param1.§\x011wD§);
         }
         if(param1.§\x0b\x19@@\x02§ != null && param1.§\x0b\x19@@\x02§.parent != null)
         {
            param1.§\x0b\x19@@\x02§.parent.removeChild(param1.§\x0b\x19@@\x02§);
         }
         param1.§\x10\x1e\x01§.§\x07\x03=D§(true);
         mtMark(param1,false);
         _loc3_.push(param1);
         mtPoolN[0]++;
      }

      // shows or hides the leader marker of trooper param1, if it has one (§*\x17Z\x10§: one sprite per marked trooper,
      // moved by a singleton tween that drops the destroyed troopers' ones)
      public static function mtMark(param1:*, param2:Boolean) : void
      {
         var _loc3_:Array = §{DEL}\f\x01§.§*\x17Z\x10§.§\x02sF^§;
         var _loc4_:int = 0;
         if(!param1.§\x1c(h7\x03§ || _loc3_ == null)
         {
            return;
         }
         while(_loc4_ < _loc3_.length)
         {
            if(_loc3_[_loc4_]["{DEL}(\x01"] === param1)
            {
               _loc3_[_loc4_]["r\x01\x02"].visible = param2;
            }
            _loc4_++;
         }
      }

      // a body (display trooper) is the one of keyframe info param2 if it holds the same first weapon (an id can come
      // back in a later wave as another trooper)
      public static function mtSameBody(param1:*, param2:Object) : Boolean
      {
         var _loc3_:Array = param1.§\x1dI\x02\r\x03§;
         var _loc4_:Array = param2 == null ? null : param2["\x1dI\x02\r\x03"];
         if(_loc4_ == null || _loc3_ == null)
         {
            return false;
         }
         if(_loc3_.length == 0 || _loc4_.length == 0)
         {
            return _loc3_.length == _loc4_.length;
         }
         return int(_loc3_[0]["7X\x01"]) == int(_loc4_[0]["7X\x01"]);
      }

      // the pooled trooper of id param1 that can stand for keyframe info param2 (mtReusable) or, param3, for a body; null
      // if none
      public static function mtFind(param1:int, param2:Object, param3:Boolean) : *
      {
         var _loc4_:Array = mtPool[param1];
         var _loc5_:int = 0;
         if(_loc4_ == null)
         {
            return null;
         }
         while(_loc5_ < _loc4_.length)
         {
            if(param3 ? _loc4_[_loc5_].§Qg}\x07§ && (param2 == null || mtSameBody(_loc4_[_loc5_],param2)) : mtReusable(_loc4_[_loc5_],param2))
            {
               return _loc4_[_loc5_];
            }
            _loc5_++;
         }
         return null;
      }

      // that pooled trooper back on the field, or null
      public static function mtUnstash(param1:int, param2:Object, param3:Boolean) : *
      {
         var _loc4_:* = mtFind(param1,param2,param3);
         if(_loc4_ == null)
         {
            if(mtPool[param1] != null)
            {
               mtPoolN[3]++;
            }
            return null;
         }
         mtPool[param1].§fl@@\x02§(_loc4_);
         §n#\x07\f§.§*#\x01§.§7q\x01§.§\x10Gv\x01§(_loc4_.§\x011wD§,§n#\x07\f§.§o?G\x19§);
         if(_loc4_.§\x0b\x19@@\x02§ != null)
         {
            §n#\x07\f§.§*#\x01§.§l\x04^%\x03§.addChild(_loc4_.§\x0b\x19@@\x02§);
         }
         mtGame.§F;R\x12\x01§.§\x1fs\x0ev§.push(_loc4_);
         mtGame.§`1\x1f*\x02§.push(_loc4_);
         _loc4_.§\x10\x1e\x01§.§\x07\x03=D§(false);
         mtMark(_loc4_,true);
         mtPoolN[1]++;
         _loc4_.rMm8();
         if(_loc4_.§\x05\x03\x1a\x01§ != null)
         {
            _loc4_.§\x05\x03\x1a\x01§.§;x\x19\x07\x02§();
         }
         return _loc4_;
      }

      // Pre-warming (mtFrame): the troopers and bodies of the keyframes (one per (id, held weapon), one body per id, that
      // the pool lacks), the wave starts, wave ends and the end first, created off the field and stashed in the same call (never drawn), so that a first jump finds them in
      // the pool. mtWarmP: pass (0 troopers, 1 bodies, 2 done), mtWarmAt: keyframe, mtWarmK: index in it.
      public static var mtWarmP:int = 0;
      public static var mtWarmAt:int = 0;
      public static var mtWarmK:int = 0;
      public static var mtWarmHold:int = 0;
      public static var mtTm:* = null;

      // creates at most one trooper; false once everything is warm
      public static function mtWarm() : Boolean
      {
         var _loc1_:Object = null;
         var _loc2_:Array = null;
         var _loc3_:Object = null;
         var _loc5_:* = null;
         var _loc6_:int = 0;
         var _loc7_:Boolean = false;
         while(mtWarmP < 2)
         {
            if(mtWarmAt >= mtKfs.length)
            {
               mtWarmP++;
               mtWarmAt = 0;
               mtWarmK = 0;
               continue;
            }
            _loc1_ = mtKfs[mtWarmAt];
            // pass 0: the wave starts, the keyframes just before each NewWave and the final one; pass 1: all
            if(mtWarmK >= _loc1_.t.length + _loc1_.d.length || mtWarmP == 0 && !(mtWarmAt == mtKfs.length - 1 || mtStarts.indexOf(int(_loc1_.i)) >= 0 || mtWarmAt + 1 < mtKfs.length && mtStarts.indexOf(int(mtKfs[mtWarmAt + 1].i)) >= 0))
            {
               mtWarmAt++;
               mtWarmK = 0;
               continue;
            }
            _loc6_ = mtWarmK++;
            _loc7_ = _loc6_ >= _loc1_.t.length;
            if(_loc7_)
            {
               _loc6_ -= _loc1_.t.length;
            }
            _loc3_ = (_loc7_ ? _loc1_.d : _loc1_.t)[_loc6_];
            _loc5_ = int(_loc3_["5E[\x1d"]["7X\x01"]);
            // a trooper with a vehicle is never reusable (mtReusable) nor pooled (mtStash): not pre-warmed
            if(_loc3_["(\t\x01"] != null || (_loc7_ ? mtFind(_loc5_,_loc3_,true) != null : mtFind(_loc5_,_loc3_,false) != null || mtGame.§;|^W§(_loc5_) != null && mtReusable(mtGame.§;|^W§(_loc5_),_loc3_)))
            {
               continue;
            }
            _loc5_ = mtGame.§y#;B\x01§(mtCopy(_loc3_));
            if(_loc7_)
            {
               mtExtra(_loc5_,_loc1_.dx[_loc6_],false);
               _loc5_.§\x16mf\x01§();
               _loc5_.§PNcV\x01§(int(_loc1_.dx[_loc6_][0]) == 4 ? §/U3W§.§ohzk\x03§ : §/U3W§.§?u{T\x01§);
               mtFf(_loc5_);
            }
            mtStash(_loc5_);
            return true;
         }
         return false;
      }

      // the keyframe info of trooper id param2, if any
      public static function mtInfo(param1:Array, param2:int) : Object
      {
         var _loc3_:int = 0;
         while(_loc3_ < param1.length)
         {
            if(int(param1[_loc3_]["5E[\x1d"]["7X\x01"]) == param2)
            {
               return param1[_loc3_];
            }
            _loc3_++;
         }
         return null;
      }

      // A display trooper on the field, alive, not fading out, with no vehicle and holding the same weapon type on the
      // same side as in the keyframe keeps its skin (building one is the costly part of a restore): mtReuse resets the
      // rest as a new trooper would have it. Others are destroyed and created anew.
      public static function mtReusable(param1:*, param2:Object) : Boolean
      {
         return !param1.§Qg}\x07§ && !param1.§\x06TY0§ && param1.§n*L%\x01§ == null && param1.§W\x19\x1bT\x03§ == null && param2["(\t\x01"] == null && param1.§\x10\x1e\x01§ != null && param1.§5\tmF§ != null && param1.§5\tmF§["An%6"] == param2["m\x0e\x01"] && param1.§9\x118u§ == int(param2["9\x118u"]);
      }

      // A reused trooper as §y#;B\x01§(info) and mtExtra(x) leave a new one: info fields (§\x17;!\x01§ without the skin
      // rebuild), keyframe statuses, wounds, healed, default facing of its side, standing (or its held pose: mtExtra), no
      // label, shake, speed, colour effect or effect sprite left. Display properties are written only when they differ
      // (a write makes Ruffle render the object and its filters again); the skin is recoloured (§)&v\x07\x03§) only when
      // one of its inputs changed.
      public static function mtReuse(param1:*, param2:Object, param3:Array) : void
      {
         var _loc3_:* = null;
         var _loc4_:int = 0;
         var _loc5_:Boolean = false;
         param1.§'~i\x17\x03§();
         // a label callback of the animation that was playing (e.g. "hit" during an approach) must not fire later
         if(param1.§\x05\x03\x1a\x01§ != null)
         {
            param1.§\x05\x03\x1a\x01§.§;x\x19\x07\x02§();
         }
         param1.§\x07\x15np\x02§ = false;
         _loc5_ = param1.§(\x1f\x15F\x01§ != Boolean(param2["(\x1f\x15F\x01"]) || mtStr(param1.§\x13fT$\x03§) != mtStr(param3[1]) || mtStr(param1.§3\x12\x06c\x03§) != mtStr(param3[2]) || param1.§XEC3\x03§ != param3[3] || param1.§j^\n\x04\x01§ || param1.§\x1c\x11_F\x03§;
         param1.§(\x1f\x15F\x01§ = Boolean(param2["(\x1f\x15F\x01"]);
         param1.§\x12?g-§ = int(param2["\x12?g-"]);
         param1.§\x17\\tX§(param2["\x1dI\x02\r\x03"]);
         param1.§5\tmF§ = param1.§RH|(§(param2["m\x0e\x01"]);
         param1.§\x13fT$\x03§ = param3[1].concat();
         param1.§3\x12\x06c\x03§ = param3[2].concat();
         param1.§XEC3\x03§ = param3[3];
         param1.§j^\n\x04\x01§ = false;
         param1.§\x1c\x11_F\x03§ = false;
         param1.§^\x05\x01!§ = null;
         param1.§;\x1c\x1co\x03§ = 0;
         param1.§A  (\x01§ = 0;
         param1.§\x0f\x02-2\x03§ = 0;
         param1.§\r\x19{DEL}O\x03§ = null;
         param1.§\x06[\x01§ = 0;
         param1.§u)\x01§ = 0;
         param1.§|f\x01§ = 0;
         param1.§N\x01§ = 0;
         _loc3_ = param1.§\x011wD§;
         _loc4_ = _loc3_.numChildren - 1;
         while(_loc4_ >= 0)
         {
            if(_loc3_.getChildAt(_loc4_) != param1.§%dc\x01§)
            {
               _loc3_.removeChildAt(_loc4_);
            }
            _loc4_--;
         }
         _loc3_ = param1.§%dc\x01§;
         _loc4_ = _loc3_.numChildren - 1;
         while(_loc4_ >= 0)
         {
            if(_loc3_.getChildAt(_loc4_) != param1.§H\x19Z\x05§ && _loc3_.getChildAt(_loc4_) != param1.§pBI(\x03§)
            {
               _loc3_.removeChildAt(_loc4_);
            }
            _loc4_--;
         }
         mtCt(param1.§\x011wD§);
         if(param1.§\x011wD§.alpha != 1)
         {
            param1.§\x011wD§.alpha = 1;
         }
         if(!param1.§\x011wD§.visible)
         {
            param1.§\x011wD§.visible = true;
         }
         if(param1.§\x10\x1e\x01§.§1;\x01§.x != 0)
         {
            param1.§\x10\x1e\x01§.§1;\x01§.x = 0;
         }
         mtCt(param1.§\x10\x1e\x01§.§1;\x01§);
         param1.§}3\x01o\x02§(int(param2["9\x118u"]));
         if(param1.§G\x1ad@§ != param1.§\x136@\x02\x01§)
         {
            param1.§qlh\t\x03§(param1.§\x136@\x02\x01§);
         }
         param1.§\x1f?\x0e\t\x03§(int(param2["v\x01"]),int(param2["l\x01"]));
         if(param1.§9(Is§ != §/U3W§.§T$(K\x03§ || param1.§5%um\x01§)
         {
            param1.§PNcV\x01§(§/U3W§.§T$(K\x03§);
         }
         if(_loc5_)
         {
            param1.§)&v\x07\x03§();
         }
         param1.rMm8();
      }

      // the display object's colour transform back to identity, written only if it is not
      public static function mtCt(param1:*) : void
      {
         var _loc2_:ColorTransform = param1.transform.colorTransform;
         if(_loc2_.redMultiplier != 1 || _loc2_.greenMultiplier != 1 || _loc2_.blueMultiplier != 1 || _loc2_.alphaMultiplier != 1 || _loc2_.redOffset != 0 || _loc2_.greenOffset != 0 || _loc2_.blueOffset != 0 || _loc2_.alphaOffset != 0)
         {
            param1.transform.colorTransform = new ColorTransform();
         }
      }

      // a side panel showing PlayerStatus data param2, or as created (boxes hidden) when null
      public static function mtPanel(param1:*, param2:Object) : void
      {
         var _loc3_:int = 0;
         if(param2 != null)
         {
            param1.§)%\x0fM\x02§(param2);
            return;
         }
         param1.§\x13fT$\x03§ = null;
         while(_loc3_ < param1.§;z-F\x01§.length)
         {
            param1.§;z-F\x01§[_loc3_]["E_i\b"].visible = false;
            param1.§;z-F\x01§[_loc3_]["\x037u3\x01"].text = "00";
            _loc3_++;
         }
      }

      // the extra state of a keyframe trooper (mtKfX) on its display trooper; param3: also its pose (not for the dead)
      public static function mtExtra(param1:*, param2:Array, param3:Boolean = true, param4:Boolean = true) : void
      {
         if(param1 == null)
         {
            return;
         }
         if(int(param2[4]) >= 0 && param1.§W\x19\x1bT\x03§ != null)
         {
            param1.§\x12?g-§ = int(param2[4]);
         }
         if(param4 && (mtStr(param1.§\x13fT$\x03§) != mtStr(param2[1]) || mtStr(param1.§3\x12\x06c\x03§) != mtStr(param2[2]) || param1.§XEC3\x03§ != param2[3]))
         {
            param1.§\x13fT$\x03§ = param2[1].concat();
            param1.§3\x12\x06c\x03§ = param2[2].concat();
            param1.§XEC3\x03§ = param2[3];
            param1.§)&v\x07\x03§();
         }
         if(!param3)
         {
            return;
         }
         // FALLEN: on the ground ("ground_crash", held); AIM: aiming ("aim", held); RELOAD: "reload_init", held
         if(int(param2[0]) == 4)
         {
            param1.§PNcV\x01§(§/U3W§.§ohzk\x03§);
            mtFf(param1);
         }
         else if(int(param2[0]) == 1)
         {
            param1.§PNcV\x01§(§/U3W§.§2Ss@§);
            mtFf(param1);
         }
         else if(int(param2[0]) == 2)
         {
            param1.§PNcV\x01§(§/U3W§.ZIxh);
            mtFf(param1);
         }
      }

      // Plays a display trooper's current animation (and the ones it chains to) to its end, as frames would: an animation
      // ends on a timeline control op (stop / goto / loop: enum indexes 9, 10, 11 of the clip's frame ops) that the render
      // runs only for the frame it shows. So the clip jumps from control op to control op (the frames in between are
      // caught up by one render, nothing is drawn for them), at most 8 jumps, until it stops or loops.
      public static function mtFf(param1:*) : void
      {
         var _loc2_:int = 0;
         var _loc3_:* = param1.§\x05\x03\x1a\x01§;
         var _loc4_:int = 0;
         var _loc5_:int = 0;
         var _loc6_:Array = null;
         var _loc7_:int = 0;
         while(_loc2_ < 8 && _loc3_.§,\x0ew^\x01§ && !_loc3_.§Yx\x02V\x01§)
         {
            _loc2_++;
            _loc4_ = _loc3_.§+\b8'\x01§ + 1;
            _loc5_ = -1;
            while(_loc5_ < 0 && _loc4_ <= _loc3_.§eo\n2§)
            {
               _loc6_ = _loc3_.§V9#?\x03§(_loc4_ - 1);
               _loc7_ = 0;
               while(_loc6_ != null && _loc7_ < _loc6_.length)
               {
                  if(int(_loc6_[_loc7_][")-Z\x19\x01"]) >= 9 && int(_loc6_[_loc7_][")-Z\x19\x01"]) <= 11)
                  {
                     _loc5_ = _loc4_;
                     break;
                  }
                  _loc7_++;
               }
               _loc4_++;
            }
            if(_loc5_ < 0)
            {
               break;
            }
            _loc3_.§+\b8'\x01§ = _loc5_;
            _loc3_.§t0!7\x01§ = _loc5_;
            _loc3_.§c+,Y§();
         }
         _loc3_.§c+,Y§();
      }

      // --- test support
      // pauses playback once entry param1 - 1 is applied
      public static function mtStopAt(param1:int) : void
      {
         mtStop = param1;
      }

      // Test support. Plays the running animations out without applying any new entry, so that two scenes reached at the
      // same index by different paths (a plain playback stopped there, a jump) can be compared whatever their animations'
      // progress: the step waiting for the next entry is put back at the head of the queue, the queue is set aside, and
      // frame() runs while an action, tween, hit-stop or busy trooper is left (at most param1 calls and 8 s, under
      // Ruffle's script time limit); the queue is put back whatever happens. Returns the number of calls (-1: an error, -2: out of time, call again).
      public static function mtSettle(param1:int) : int
      {
         var _loc2_:§Q\btf§ = mtGame;
         var _loc3_:Array = _loc2_.§\x1e-\x02\x07\x01§;
         var _loc4_:int = 0;
         var _loc5_:int = getTimer();
         mtPauseOff(_loc2_);
         if(_loc2_.§^h'l\x02§ != null)
         {
            _loc3_.unshift(_loc2_.§^h'l\x02§.§SV\x1d\x01§);
            _loc2_.§^h'l\x02§.aGx2();
            _loc2_.§^h'l\x02§ = null;
         }
         _loc2_.§\x1e-\x02\x07\x01§ = [];
         try
         {
            while(_loc4_ < param1 && mtBusy(_loc2_))
            {
               if(getTimer() - _loc5_ >= 8000)
               {
                  _loc4_ = -2;
                  break;
               }
               _loc2_.§k\n/$\x03§();
               _loc4_++;
            }
         }
         catch(_loc_e_:*)
         {
            _loc4_ = -1;
         }
         if(_loc2_.§\x1e-\x02\x07\x01§.length == 0)
         {
            _loc2_.§\x1e-\x02\x07\x01§ = _loc3_;
         }
         if(mtPaused)
         {
            mtPauseWant = true;
         }
         return _loc4_;
      }

      // an action other than the Winner's, a tween, a hit-stop or a trooper's non-looping animation is running
      public static function mtBusy(param1:§Q\btf§) : Boolean
      {
         var _loc2_:int = 0;
         while(_loc2_ < param1.§{DEL}=\x04u§.length)
         {
            if(!(param1.§{DEL}=\x04u§[_loc2_] is §I&\x01§.§r`M8\x03§))
            {
               return true;
            }
            _loc2_++;
         }
         if(param1.§;\x1az\x01§.§Te\x10\x01§.length > 0 || param1.§~Y\x12(\x01§.length > 0)
         {
            return true;
         }
         _loc2_ = 0;
         while(_loc2_ < param1.§`1\x1f*\x02§.length)
         {
            if(!param1.§`1\x1f*\x02§[_loc2_].§\x01|fz\x01§())
            {
               return true;
            }
            _loc2_++;
         }
         return false;
      }

      // comparable state of the scene: one line per display trooper by id (side, square, hp, dead, down, current
      // weapon, weapons id/type/ammo/stock, helmet, vehicle, statuses, wounds), the weapons on the ground, the side
      // panels, the end of battle. param1: also the animation, facing and pixel position (diagnostics)
      public static function mtDump(param1:Boolean = false) : String
      {
         var _loc2_:§Q\btf§ = mtGame;
         var _loc3_:Array = [];
         var _loc4_:Array = null;
         var _loc5_:* = null;
         var _loc6_:int = 0;
         var _loc7_:int = 0;
         var _loc8_:Array = null;
         var _loc9_:String = null;
         if(_loc2_ == null)
         {
            return "";
         }
         _loc4_ = _loc2_.§`1\x1f*\x02§;
         while(_loc6_ < _loc4_.length)
         {
            _loc5_ = _loc4_[_loc6_];
            _loc6_++;
            _loc8_ = [];
            _loc7_ = 0;
            while(_loc7_ < _loc5_.§\x1dI\x02\r\x03§.length)
            {
               _loc8_.push(mtWeap(_loc5_.§\x1dI\x02\r\x03§[_loc7_]));
               _loc7_++;
            }
            _loc9_ = "T" + int(_loc5_.§;\f\x01§.§5E[\x1d§["7X\x01"]) + " s" + _loc5_.§9\x118u§ + " @" + int(_loc5_.§v\x01§) + "," + int(_loc5_.§l\x01§) + " hp" + _loc5_.§\x12?g-§ + (_loc5_.§Qg}\x07§ ? " dead" : "") + (_loc5_.§5%um\x01§ ? " down" : "") + " w" + (_loc5_.§5\tmF§ == null ? "-" : String(int(_loc5_.§5\tmF§["7X\x01"]))) + " [" + _loc8_.join(",") + "] h" + (_loc5_.§(\x1f\x15F\x01§ ? 1 : 0) + " v" + (_loc5_.§W\x19\x1bT\x03§ == null ? "-" : mtStr(_loc5_.§W\x19\x1bT\x03§["7X\x01"])) + " st" + mtStr(_loc5_.§\x13fT$\x03§) + (_loc5_.§Qg}\x07§ ? "" : " inj" + mtStr(_loc5_.§3\x12\x06c\x03§)) + (_loc5_.§XEC3\x03§ ? " healed" : "");
            if(param1)
            {
               _loc9_ += " a" + (_loc5_.§9(Is§ == null ? "-" : String(int(_loc5_.§9(Is§[")-Z\x19\x01"]))) + " f" + _loc5_.§G\x1ad@§ + " g" + _loc5_.§4)\x01§ + "," + _loc5_.§A\x1f\x01§ + " px" + int(_loc5_.§v\x01§) + "," + int(_loc5_.§l\x01§);
            }
            _loc3_.push(_loc9_);
         }
         _loc4_ = _loc2_.§\x1dI\x02\r\x03§;
         _loc6_ = 0;
         while(_loc6_ < _loc4_.length)
         {
            _loc5_ = _loc4_[_loc6_];
            _loc6_++;
            _loc3_.push("G " + mtWeap(_loc5_.§\x12j;\x02\x01§) + " @" + int(_loc5_.§v\x01§) + "," + int(_loc5_.§l\x01§) + (_loc5_.§5%um\x01§ ? " landed" : ""));
         }
         _loc3_.sort();
         _loc6_ = 0;
         while(_loc6_ < _loc2_.§a]e\x1b\x02§.length)
         {
            _loc3_.push("P" + _loc6_ + " " + mtStr(_loc2_.§a]e\x1b\x02§[_loc6_].§\x13fT$\x03§));
            _loc6_++;
         }
         _loc3_.push("E " + (_loc2_.§HUgt\x03§ ? 1 : 0) + (mtWinner(_loc2_) != null ? " banner" : ""));
         return _loc3_.join("\n");
      }

      public static function mtWeap(param1:*) : String
      {
         return int(param1["7X\x01"]) + "/" + mtStr(param1["An%6"]) + "/" + int(param1["\x06\x01\x02"]["+8\x19{DEL}"]);
      }

      // Battle.history (param1: mtHist, the copy restores replay from), one oracle `EV time|tid|type` line per entry (as the
      // trace build's mtDump prints them)
      public static function mtHistStr(param1:Boolean = false) : String
      {
         var _loc1_:Array = [];
         var _loc2_:Array = param1 ? mtHist : (mtKfB == null ? [] : mtKfB.§7\x13JZ\x03§);
         var _loc3_:int = 0;
         var _loc4_:* = null;
         while(_loc3_ < _loc2_.length)
         {
            _loc4_ = _loc2_[_loc3_];
            _loc1_.push("EV " + mtStr(_loc4_["uN\x0ed"]) + "|" + mtStr(_loc4_["\x1e,d\x01"]) + "|" + mtStr(_loc4_["An%6"]));
            _loc3_++;
         }
         return _loc1_.join("\n");
      }

      // [number of keyframes, objects and arrays they own (trooper data and enums are shared, not counted), values they
      // hold, largest gap between two of them]
      public static function mtKfSize() : Array
      {
         var _loc1_:int = 0;
         var _loc2_:int = 1;
         var _loc3_:Array = [0,0];
         while(_loc2_ < mtKfs.length)
         {
            if(int(mtKfs[_loc2_].i) - int(mtKfs[_loc2_ - 1].i) > _loc1_)
            {
               _loc1_ = int(mtKfs[_loc2_].i) - int(mtKfs[_loc2_ - 1].i);
            }
            _loc2_++;
         }
         mtCount(mtKfs,_loc3_);
         return [mtKfs.length,_loc3_[0],_loc3_[1],_loc1_];
      }

      public static function mtCount(param1:*, param2:Array) : void
      {
         var _loc3_:* = null;
         var _loc4_:int = 0;
         if(param1 is Array)
         {
            param2[0]++;
            while(_loc4_ < param1.length)
            {
               param2[1]++;
               mtCount(param1[_loc4_],param2);
               _loc4_++;
            }
         }
         else if(param1 != null && !(param1 is String) && Object(param1).constructor === Object)
         {
            param2[0]++;
            for(_loc3_ in param1)
            {
               param2[1]++;
               if(_loc3_ != "5E[\x1d")
               {
                  mtCount(param1[_loc3_],param2);
               }
            }
         }
      }

      public static function mtApplied(param1:§Q\btf§) : int
      {
         return mtTotal - param1.§\x1e-\x02\x07\x01§.length - (param1.§^h'l\x02§ != null ? 1 : 0);
      }

      // Before each frame(): mtFresh (copies at the head of the queue), then: the steps of PlayerStatus (BattleMsg 40) and
      // Winner (34) never use their entry's tid trooper in apply(), but
      // their constructor still waits for it to be on screen. After a checkpoint jump the rebuild has removed the dead
      // troopers, so such an entry after that CheckPoint whose tid died would wait forever (seen on a raid: a seek to
      // the end stuck after the last CheckPoint, the Winner never applied). Their pending ids are dropped; in a plain
      // replay the tid trooper is still on screen (dying at worst), so nothing changes there.
      public static function mtUnwait(param1:§Q\btf§) : void
      {
         var _loc2_:* = param1.§^h'l\x02§;
         var _loc3_:int = _loc2_ == null ? -1 : int(_loc2_.§SV\x1d\x01§["An%6"][")-Z\x19\x01"]);
         mtFresh(param1);
         if((_loc3_ == 40 || _loc3_ == 34) && _loc2_.§(;D\n§.length > 0)
         {
            _loc2_.§(;D\n§ = [];
         }
      }

      // hidden replay: the clock's high-water mark set to the current step's time, so that the step applies as soon as
      // its troopers are idle instead of after the clock has counted up to it (only the clock widget shows that count)
      public static function mtHurry(param1:§Q\btf§) : void
      {
         var _loc2_:* = param1.§^h'l\x02§;
         var _loc3_:int = _loc2_ == null ? 0 : int(_loc2_.§SV\x1d\x01§["uN\x0ed"]);
         if(_loc3_ > param1.§|H6s\x03§)
         {
            param1.§|H6s\x03§ = _loc3_;
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
//@@ PC_PLAY_KF_FIND  (Game ENTER_FRAME handler, state 0: `if(battle.resolve())`)
callproperty QName(PackageNamespace(""),"MnRZ"), 0
convert_b
iffalse ofs0061
//@@ PC_PLAY_KF_REPLACE  (=> `if(§(m]a\x02§.mtKfGo(battle, battle.resolve()))`: keyframes (read-only), and state 0 left as soon as the history has entries (the rest is resolved while the battle plays: mtSimFrame))
callproperty QName(PackageNamespace(""),"MnRZ"), 0
getlex QName(PackageNamespace(""),"(m]a\x02")
swap
findproperty QName(PackageNamespace(""),"S\rNK\x02")
getproperty QName(PackageNamespace(""),"S\rNK\x02")
swap
callproperty QName(PackageNamespace(""),"mtKfGo"), 2
convert_b
iffalse ofs0061
//@@ PC_PLAY_KF_STACK_FIND  (same method: its declared operand stack depth)
maxstack 2
//@@ PC_PLAY_KF_STACK_REPLACE  (=> 3: the helper class, the battle and resolve()'s result while mtKfGo is called)
maxstack 3
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
//@@ PC_PLAY_TICK_FIND  (Game tick() §&~\x03'§: `Clip.renderAll(); Clip.advanceAll();`)
getlex QName(PackageNamespace("`\x0b\x01.\tnP+"),";io&")
callpropvoid QName(PackageNamespace(""),"i\'\x04W\x02"), 0
getlex QName(PackageNamespace("`\x0b\x01.\tnP+"),";io&")
callpropvoid QName(PackageNamespace(""),"?d0r\x01"), 0
//@@ PC_PLAY_TICK_REPLACE  (=> `§(m]a\x02§.mtClips();`, which makes the same two calls)
getlex QName(PackageNamespace(""),"(m]a\x02")
callpropvoid QName(PackageNamespace(""),"mtClips"), 0
//@@ END
