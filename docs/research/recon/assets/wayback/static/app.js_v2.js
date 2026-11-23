$estr = function() { return js.Boot.__string_rec(this,''); }
StringTools = function() { }
StringTools.__name__ = ["StringTools"];
StringTools.urlEncode = function(s) {
	return encodeURIComponent(s);
}
StringTools.urlDecode = function(s) {
	return decodeURIComponent(s.split("+").join(" "));
}
StringTools.htmlEscape = function(s) {
	return s.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}
StringTools.htmlUnescape = function(s) {
	return s.split("&gt;").join(">").split("&lt;").join("<").split("&amp;").join("&");
}
StringTools.startsWith = function(s,start) {
	return s.length >= start.length && s.substr(0,start.length) == start;
}
StringTools.endsWith = function(s,end) {
	var elen = end.length;
	var slen = s.length;
	return slen >= elen && s.substr(slen - elen,elen) == end;
}
StringTools.isSpace = function(s,pos) {
	var c = s.charCodeAt(pos);
	return c >= 9 && c <= 13 || c == 32;
}
StringTools.ltrim = function(s) {
	var l = s.length;
	var r = 0;
	while(r < l && StringTools.isSpace(s,r)) r++;
	if(r > 0) return s.substr(r,l - r); else return s;
}
StringTools.rtrim = function(s) {
	var l = s.length;
	var r = 0;
	while(r < l && StringTools.isSpace(s,l - r - 1)) r++;
	if(r > 0) return s.substr(0,l - r); else return s;
}
StringTools.trim = function(s) {
	return StringTools.ltrim(StringTools.rtrim(s));
}
StringTools.rpad = function(s,c,l) {
	var sl = s.length;
	var cl = c.length;
	while(sl < l) if(l - sl < cl) {
		s += c.substr(0,l - sl);
		sl = l;
	} else {
		s += c;
		sl += cl;
	}
	return s;
}
StringTools.lpad = function(s,c,l) {
	var ns = "";
	var sl = s.length;
	if(sl >= l) return s;
	var cl = c.length;
	while(sl < l) if(l - sl < cl) {
		ns += c.substr(0,l - sl);
		sl = l;
	} else {
		ns += c;
		sl += cl;
	}
	return ns + s;
}
StringTools.replace = function(s,sub,by) {
	return s.split(sub).join(by);
}
StringTools.hex = function(n,digits) {
	var s = "";
	var hexChars = "0123456789ABCDEF";
	do {
		s = hexChars.charAt(n & 15) + s;
		n >>>= 4;
	} while(n > 0);
	if(digits != null) while(s.length < digits) s = "0" + s;
	return s;
}
StringTools.fastCodeAt = function(s,index) {
	return s.cca(index);
}
StringTools.isEOF = function(c) {
	return c != c;
}
StringTools.prototype.__class__ = StringTools;
if(typeof haxe=='undefined') haxe = {}
haxe.Log = function() { }
haxe.Log.__name__ = ["haxe","Log"];
haxe.Log.trace = function(v,infos) {
	js.Boot.__trace(v,infos);
}
haxe.Log.clear = function() {
	js.Boot.__clear_trace();
}
haxe.Log.prototype.__class__ = haxe.Log;
Common = function() { }
Common.__name__ = ["Common"];
Common.host = function(name) {
	var host = mt.db.Phoneme.removeAccentsUTF8(name).toLowerCase();
	host = StringTools.trim(host);
	host = new EReg("\\s+","g").replace(host,"-");
	host = new EReg("[^a-z0-9.-]+","g").replace(host,"");
	if(host.length > 16) {
		var parts = host.split("-");
		if(parts[0].length >= 8) host = parts[0]; else host = host.substr(0,16);
	}
	return host;
}
Common.hostValid = function(h) {
	return h.length >= 3 && h != "www" && h != "local" && h != "data";
}
Common.prototype.__class__ = Common;
StringBuf = function(p) {
	if( p === $_ ) return;
	this.b = new Array();
}
StringBuf.__name__ = ["StringBuf"];
StringBuf.prototype.add = function(x) {
	this.b[this.b.length] = x;
}
StringBuf.prototype.addSub = function(s,pos,len) {
	this.b[this.b.length] = s.substr(pos,len);
}
StringBuf.prototype.addChar = function(c) {
	this.b[this.b.length] = String.fromCharCode(c);
}
StringBuf.prototype.toString = function() {
	return this.b.join("");
}
StringBuf.prototype.b = null;
StringBuf.prototype.__class__ = StringBuf;
if(!haxe.io) haxe.io = {}
haxe.io.Bytes = function(length,b) {
	if( length === $_ ) return;
	this.length = length;
	this.b = b;
}
haxe.io.Bytes.__name__ = ["haxe","io","Bytes"];
haxe.io.Bytes.alloc = function(length) {
	var a = new Array();
	var _g = 0;
	while(_g < length) {
		var i = _g++;
		a.push(0);
	}
	return new haxe.io.Bytes(length,a);
}
haxe.io.Bytes.ofString = function(s) {
	var a = new Array();
	var _g1 = 0, _g = s.length;
	while(_g1 < _g) {
		var i = _g1++;
		var c = s.cca(i);
		if(c <= 127) a.push(c); else if(c <= 2047) {
			a.push(192 | c >> 6);
			a.push(128 | c & 63);
		} else if(c <= 65535) {
			a.push(224 | c >> 12);
			a.push(128 | c >> 6 & 63);
			a.push(128 | c & 63);
		} else {
			a.push(240 | c >> 18);
			a.push(128 | c >> 12 & 63);
			a.push(128 | c >> 6 & 63);
			a.push(128 | c & 63);
		}
	}
	return new haxe.io.Bytes(a.length,a);
}
haxe.io.Bytes.ofData = function(b) {
	return new haxe.io.Bytes(b.length,b);
}
haxe.io.Bytes.prototype.length = null;
haxe.io.Bytes.prototype.b = null;
haxe.io.Bytes.prototype.get = function(pos) {
	return this.b[pos];
}
haxe.io.Bytes.prototype.set = function(pos,v) {
	this.b[pos] = v & 255;
}
haxe.io.Bytes.prototype.blit = function(pos,src,srcpos,len) {
	if(pos < 0 || srcpos < 0 || len < 0 || pos + len > this.length || srcpos + len > src.length) throw haxe.io.Error.OutsideBounds;
	var b1 = this.b;
	var b2 = src.b;
	if(b1 == b2 && pos > srcpos) {
		var i = len;
		while(i > 0) {
			i--;
			b1[i + pos] = b2[i + srcpos];
		}
		return;
	}
	var _g = 0;
	while(_g < len) {
		var i = _g++;
		b1[i + pos] = b2[i + srcpos];
	}
}
haxe.io.Bytes.prototype.sub = function(pos,len) {
	if(pos < 0 || len < 0 || pos + len > this.length) throw haxe.io.Error.OutsideBounds;
	return new haxe.io.Bytes(len,this.b.slice(pos,pos + len));
}
haxe.io.Bytes.prototype.compare = function(other) {
	var b1 = this.b;
	var b2 = other.b;
	var len = this.length < other.length?this.length:other.length;
	var _g = 0;
	while(_g < len) {
		var i = _g++;
		if(b1[i] != b2[i]) return b1[i] - b2[i];
	}
	return this.length - other.length;
}
haxe.io.Bytes.prototype.readString = function(pos,len) {
	if(pos < 0 || len < 0 || pos + len > this.length) throw haxe.io.Error.OutsideBounds;
	var s = "";
	var b = this.b;
	var fcc = String.fromCharCode;
	var i = pos;
	var max = pos + len;
	while(i < max) {
		var c = b[i++];
		if(c < 128) {
			if(c == 0) break;
			s += fcc(c);
		} else if(c < 224) s += fcc((c & 63) << 6 | b[i++] & 127); else if(c < 240) {
			var c2 = b[i++];
			s += fcc((c & 31) << 12 | (c2 & 127) << 6 | b[i++] & 127);
		} else {
			var c2 = b[i++];
			var c3 = b[i++];
			s += fcc((c & 15) << 18 | (c2 & 127) << 12 | c3 << 6 & 127 | b[i++] & 127);
		}
	}
	return s;
}
haxe.io.Bytes.prototype.toString = function() {
	return this.readString(0,this.length);
}
haxe.io.Bytes.prototype.toHex = function() {
	var s = new StringBuf();
	var chars = [];
	var str = "0123456789abcdef";
	var _g1 = 0, _g = str.length;
	while(_g1 < _g) {
		var i = _g1++;
		chars.push(str.charCodeAt(i));
	}
	var _g1 = 0, _g = this.length;
	while(_g1 < _g) {
		var i = _g1++;
		var c = this.b[i];
		s.b[s.b.length] = String.fromCharCode(chars[c >> 4]);
		s.b[s.b.length] = String.fromCharCode(chars[c & 15]);
	}
	return s.b.join("");
}
haxe.io.Bytes.prototype.getData = function() {
	return this.b;
}
haxe.io.Bytes.prototype.__class__ = haxe.io.Bytes;
IntIter = function(min,max) {
	if( min === $_ ) return;
	this.min = min;
	this.max = max;
}
IntIter.__name__ = ["IntIter"];
IntIter.prototype.min = null;
IntIter.prototype.max = null;
IntIter.prototype.hasNext = function() {
	return this.min < this.max;
}
IntIter.prototype.next = function() {
	return this.min++;
}
IntIter.prototype.__class__ = IntIter;
if(typeof mt=='undefined') mt = {}
if(!mt.db) mt.db = {}
mt.db.Phoneme = function(p) {
	if( p === $_ ) return;
	if(mt.db.Phoneme.tables == null) mt.db.Phoneme.initTables();
}
mt.db.Phoneme.__name__ = ["mt","db","Phoneme"];
mt.db.Phoneme.tables = null;
mt.db.Phoneme.initTables = function() {
	mt.db.Phoneme.tables = [{ terminal : null, table : []}];
	mt.db.Phoneme.repl("EAU","O");
	mt.db.Phoneme.repl("AU","O");
	mt.db.Phoneme.repl("OU","U");
	mt.db.Phoneme.repl("EU","e");
	mt.db.Phoneme.repl("AI","e");
	mt.db.Phoneme.repl("ER","e");
	mt.db.Phoneme.repl("CH","sh");
	mt.db.Phoneme.repl("OE","e");
	mt.db.Phoneme.repl("PH","F");
	mt.db.Phoneme.repl("H","");
	mt.db.Phoneme.repl("S$","$");
	mt.db.Phoneme.repl("T$","$");
	mt.db.Phoneme.repl("TS$","$");
	mt.db.Phoneme.repl("E$","$");
	mt.db.Phoneme.repl("ES$","$");
	mt.db.Phoneme.repl("P$","$");
	mt.db.Phoneme.repl("X$","$");
	mt.db.Phoneme.repl("ER$","e$");
	mt.db.Phoneme.repl("EE","e");
	mt.db.Phoneme.repl("AA","A");
	mt.db.Phoneme.repl("OO","O");
	mt.db.Phoneme.repl("UU","U");
	mt.db.Phoneme.repl("II","I");
	mt.db.Phoneme.repl("LL","L");
	mt.db.Phoneme.repl("TT","T");
	mt.db.Phoneme.repl("SS","S");
	mt.db.Phoneme.repl("NN","N");
	mt.db.Phoneme.repl("MM","N");
	mt.db.Phoneme.repl("RR","R");
	mt.db.Phoneme.repl("PP","P");
	mt.db.Phoneme.repl("FF","F");
	mt.db.Phoneme.repl("C","K");
	mt.db.Phoneme.repl("CE","SE");
	mt.db.Phoneme.repl("CS","X");
	mt.db.Phoneme.repl("CK","K");
	mt.db.Phoneme.repl("SK","K");
	mt.db.Phoneme.repl("QU","K");
	mt.db.Phoneme.repl("GU","G");
	mt.db.Phoneme.repl("GE","J");
	mt.db.Phoneme.repl("Y","I");
	mt.db.Phoneme.repl("Z","S");
	mt.db.Phoneme.repl("TIO","SIO");
	mt.db.Phoneme.repl("TIA","SIA");
	mt.db.Phoneme.repl("ERT","ert");
	mt.db.Phoneme.repl("EN","n");
	mt.db.Phoneme.repl("ON","n");
	mt.db.Phoneme.repl("ION","ioN");
	mt.db.Phoneme.repl("IN","n");
	mt.db.Phoneme.repl("INE","iNE");
	mt.db.Phoneme.repl("AIN","n");
	mt.db.Phoneme.repl("AN","n");
	mt.db.Phoneme.repl("AM","n");
	mt.db.Phoneme.repl("EM","n");
	mt.db.Phoneme.repl("OM","n");
	mt.db.Phoneme.repl("EMM","em");
	mt.db.Phoneme.repl("AMM","am");
	mt.db.Phoneme.repl("OMM","om");
}
mt.db.Phoneme.repl = function(a,b) {
	var state = 0;
	var _g1 = 0, _g = a.length;
	while(_g1 < _g) {
		var i = _g1++;
		var t = mt.db.Phoneme.tables[state].table;
		var c = a.charCodeAt(i);
		state = t[c];
		if(state == null) {
			state = mt.db.Phoneme.tables.length;
			t[c] = state;
			mt.db.Phoneme.tables.push({ terminal : null, table : new Array()});
		}
	}
	var t = mt.db.Phoneme.tables[state];
	if(t.terminal != null) throw "Duplicate replace " + a;
	if(a.length < b.length) throw "Invalid replace " + a + ":" + b;
	t.terminal = haxe.io.Bytes.ofString(b);
}
mt.db.Phoneme.removeAccentsUTF8 = function(s) {
	var b = new StringBuf();
	var _g1 = 0, _g = s.length;
	while(_g1 < _g) {
		var i = _g1++;
		var c = s.charCodeAt(i);
		switch(c) {
		case 233:case 232:case 234:case 235:
			b.b[b.b.length] = String.fromCharCode(101);
			break;
		case 201:case 200:case 202:case 203:
			b.b[b.b.length] = String.fromCharCode(69);
			break;
		case 224:case 226:case 228:case 225:
			b.b[b.b.length] = String.fromCharCode(97);
			break;
		case 192:case 194:case 196:case 193:
			b.b[b.b.length] = String.fromCharCode(65);
			break;
		case 249:case 251:case 252:case 250:
			b.b[b.b.length] = String.fromCharCode(117);
			break;
		case 217:case 219:case 220:case 218:
			b.b[b.b.length] = String.fromCharCode(85);
			break;
		case 238:case 239:case 237:
			b.b[b.b.length] = String.fromCharCode(105);
			break;
		case 206:case 207:case 205:
			b.b[b.b.length] = String.fromCharCode(73);
			break;
		case 244:case 243:case 246:case 245:
			b.b[b.b.length] = String.fromCharCode(111);
			break;
		case 212:case 211:case 214:
			b.b[b.b.length] = String.fromCharCode(79);
			break;
		case 230:case 198:
			b.b[b.b.length] = String.fromCharCode(97);
			b.b[b.b.length] = String.fromCharCode(101);
			break;
		case 339:case 338:
			b.b[b.b.length] = String.fromCharCode(111);
			b.b[b.b.length] = String.fromCharCode(101);
			break;
		case 231:
			b.b[b.b.length] = String.fromCharCode(99);
			break;
		case 199:
			b.b[b.b.length] = String.fromCharCode(67);
			break;
		case 241:
			b.b[b.b.length] = String.fromCharCode(110);
			break;
		case 209:
			b.b[b.b.length] = String.fromCharCode(78);
			break;
		default:
			b.b[b.b.length] = String.fromCharCode(c);
		}
	}
	return b.b.join("");
}
mt.db.Phoneme.prototype.s = null;
mt.db.Phoneme.prototype.get = function(at) {
	return this.s.charCodeAt(at);
}
mt.db.Phoneme.prototype.make = function(s) {
	s = mt.db.Phoneme.removeAccentsUTF8(s);
	s = s.toUpperCase();
	var buf = new StringBuf();
	var b = haxe.io.Bytes.ofString("$" + new EReg("[^A-Z]+","g").split(s).join("$") + "$");
	var i = 0;
	var max = b.length;
	var tables = mt.db.Phoneme.tables;
	var t, state;
	var lastpos = 0, last, startpos;
	while(i < max) {
		last = null;
		startpos = i;
		t = tables[0];
		do {
			state = t.table[b.b[i]];
			if(state == null) break;
			t = tables[state];
			++i;
			if(t.terminal != null) {
				last = t.terminal;
				lastpos = i;
			}
		} while(i < max);
		if(last == null) {
			i = startpos;
			var c = b.b[i];
			if(c >= 97 && c <= 122) c += -32;
			buf.b[buf.b.length] = String.fromCharCode(c);
			i++;
		} else {
			var len = last.length;
			i = lastpos - len;
			b.blit(i,last,0,len);
		}
	}
	return buf.b.join("");
}
mt.db.Phoneme.prototype.__class__ = mt.db.Phoneme;
haxe.Timer = function(time_ms) {
	if( time_ms === $_ ) return;
	this.id = haxe.Timer.arr.length;
	haxe.Timer.arr[this.id] = this;
	this.timerId = window.setInterval("haxe.Timer.arr[" + this.id + "].run();",time_ms);
}
haxe.Timer.__name__ = ["haxe","Timer"];
haxe.Timer.delay = function(f,time_ms) {
	var t = new haxe.Timer(time_ms);
	t.run = function() {
		t.stop();
		f();
	};
	return t;
}
haxe.Timer.measure = function(f,pos) {
	var t0 = haxe.Timer.stamp();
	var r = f();
	haxe.Log.trace(haxe.Timer.stamp() - t0 + "s",pos);
	return r;
}
haxe.Timer.stamp = function() {
	return Date.now().getTime() / 1000;
}
haxe.Timer.prototype.id = null;
haxe.Timer.prototype.timerId = null;
haxe.Timer.prototype.stop = function() {
	if(this.id == null) return;
	window.clearInterval(this.timerId);
	haxe.Timer.arr[this.id] = null;
	if(this.id > 100 && this.id == haxe.Timer.arr.length - 1) {
		var p = this.id - 1;
		while(p >= 0 && haxe.Timer.arr[p] == null) p--;
		haxe.Timer.arr = haxe.Timer.arr.slice(0,p + 1);
	}
	this.id = null;
}
haxe.Timer.prototype.run = function() {
}
haxe.Timer.prototype.__class__ = haxe.Timer;
haxe.io.Error = { __ename__ : ["haxe","io","Error"], __constructs__ : ["Blocked","Overflow","OutsideBounds","Custom"] }
haxe.io.Error.Blocked = ["Blocked",0];
haxe.io.Error.Blocked.toString = $estr;
haxe.io.Error.Blocked.__enum__ = haxe.io.Error;
haxe.io.Error.Overflow = ["Overflow",1];
haxe.io.Error.Overflow.toString = $estr;
haxe.io.Error.Overflow.__enum__ = haxe.io.Error;
haxe.io.Error.OutsideBounds = ["OutsideBounds",2];
haxe.io.Error.OutsideBounds.toString = $estr;
haxe.io.Error.OutsideBounds.__enum__ = haxe.io.Error;
haxe.io.Error.Custom = function(e) { var $x = ["Custom",3,e]; $x.__enum__ = haxe.io.Error; $x.toString = $estr; return $x; }
Std = function() { }
Std.__name__ = ["Std"];
Std["is"] = function(v,t) {
	return js.Boot.__instanceof(v,t);
}
Std.string = function(s) {
	return js.Boot.__string_rec(s,"");
}
Std["int"] = function(x) {
	if(x < 0) return Math.ceil(x);
	return Math.floor(x);
}
Std.parseInt = function(x) {
	var v = parseInt(x,10);
	if(v == 0 && x.charCodeAt(1) == 120) v = parseInt(x);
	if(isNaN(v)) return null;
	return v;
}
Std.parseFloat = function(x) {
	return parseFloat(x);
}
Std.random = function(x) {
	return Math.floor(Math.random() * x);
}
Std.prototype.__class__ = Std;
if(!mt.js) mt.js = {}
mt.js.Timer = function(now,end,start) {
	if( now === $_ ) return;
	this.t = now.getTime();
	this.start = start == null?now:start;
	this.end = end;
	if(mt.js.Timer.timer == null) {
		mt.js.Timer.timer = new haxe.Timer(1000);
		mt.js.Timer.timer.run = function() {
			var _g = 0, _g1 = mt.js.Timer.timers;
			while(_g < _g1.length) {
				var t = _g1[_g];
				++_g;
				t.update();
			}
		};
	}
	mt.js.Timer.timers.push(this);
}
mt.js.Timer.__name__ = ["mt","js","Timer"];
mt.js.Timer.timer = null;
mt.js.Timer.alloc = function(now,end,prec,div) {
	if(div == null) {
		div = "timer_" + mt.js.Timer.timers.length;
		js.Lib.document.write("<div id=\"" + div + "\" class=\"timer\"></div>");
	}
	var t = new mt.js.Timer(Date.fromString(now),Date.fromString(end));
	t.textDiv = { id : div, prec : prec};
	t.update();
	return t;
}
mt.js.Timer.prototype.t = null;
mt.js.Timer.prototype.start = null;
mt.js.Timer.prototype.end = null;
mt.js.Timer.prototype.progress = null;
mt.js.Timer.prototype.rem = null;
mt.js.Timer.prototype.textDiv = null;
mt.js.Timer.prototype.progressDiv = null;
mt.js.Timer.prototype.stop = function() {
	mt.js.Timer.timers.remove(this);
}
mt.js.Timer.prototype.buildText = function() {
	var str = "";
	var prec = this.textDiv.prec;
	var force = false;
	if(prec < 1) {
		var sep = this.rem.seconds % 2 == 0?":":"<span style=\"opacity : 0\">:</span>";
		if(this.rem.hours > 0) {
			var str1 = this.rem.hours + sep;
			if(this.rem.minutes < 10) str1 += "0";
			return str1 + this.rem.minutes;
		}
		var str1 = this.rem.minutes + sep;
		if(this.rem.seconds < 10) str1 += "0";
		return str1 + this.rem.seconds;
	}
	if(this.rem.days > 0) {
		str += this.rem.days + mt.js.Timer.TIMES.charAt(0) + " ";
		force = true;
		if(--prec == 0) return str;
	}
	if(force || this.rem.hours > 0) {
		str += this.rem.hours + mt.js.Timer.TIMES.charAt(1) + " ";
		force = true;
		if(--prec == 0) return str;
	}
	if(force || this.rem.minutes > 0) {
		if(force && this.rem.minutes < 10) str += "0";
		str += this.rem.minutes + mt.js.Timer.TIMES.charAt(2) + " ";
		force = true;
		if(--prec == 0) return str;
	}
	if(force && this.rem.seconds < 10) str += "0";
	str += this.rem.seconds + mt.js.Timer.TIMES.charAt(3) + " ";
	return str;
}
mt.js.Timer.prototype.update = function() {
	this.t += 1000;
	var remt = (this.end.getTime() - this.t) / 1000;
	var rt = remt < 0?0:remt;
	this.rem = { days : Std["int"](rt / 86400), hours : Std["int"](rt / 3600) % 24, minutes : Std["int"](rt / 60) % 60, seconds : Std["int"](rt % 60), time : remt};
	var et = this.end.getTime();
	var st = this.start.getTime();
	this.progress = this.t >= et?1:(this.t - st) / (et - st);
	if(this.textDiv != null) {
		var div = js.Lib.document.getElementById(this.textDiv.id);
		if(div != null) div.innerHTML = this.buildText();
	}
	if(this.progressDiv != null) {
		var div = js.Lib.document.getElementById(this.progressDiv.id);
		if(div != null) {
			var w = Std["int"](this.progressDiv.width * this.progress);
			div.style.width = w + "px";
		}
	}
	if(remt <= 0) this.onReady();
	this.onUpdate();
}
mt.js.Timer.prototype.onReady = function() {
	if(this.rem.time < -2) {
		js.Lib.window.location = js.Lib.window.location;
		this.onReady = function() {
		};
	}
}
mt.js.Timer.prototype.onUpdate = function() {
}
mt.js.Timer.prototype.__class__ = mt.js.Timer;
List = function(p) {
	if( p === $_ ) return;
	this.length = 0;
}
List.__name__ = ["List"];
List.prototype.h = null;
List.prototype.q = null;
List.prototype.length = null;
List.prototype.add = function(item) {
	var x = [item];
	if(this.h == null) this.h = x; else this.q[1] = x;
	this.q = x;
	this.length++;
}
List.prototype.push = function(item) {
	var x = [item,this.h];
	this.h = x;
	if(this.q == null) this.q = x;
	this.length++;
}
List.prototype.first = function() {
	return this.h == null?null:this.h[0];
}
List.prototype.last = function() {
	return this.q == null?null:this.q[0];
}
List.prototype.pop = function() {
	if(this.h == null) return null;
	var x = this.h[0];
	this.h = this.h[1];
	if(this.h == null) this.q = null;
	this.length--;
	return x;
}
List.prototype.isEmpty = function() {
	return this.h == null;
}
List.prototype.clear = function() {
	this.h = null;
	this.q = null;
	this.length = 0;
}
List.prototype.remove = function(v) {
	var prev = null;
	var l = this.h;
	while(l != null) {
		if(l[0] == v) {
			if(prev == null) this.h = l[1]; else prev[1] = l[1];
			if(this.q == l) this.q = prev;
			this.length--;
			return true;
		}
		prev = l;
		l = l[1];
	}
	return false;
}
List.prototype.iterator = function() {
	return { h : this.h, hasNext : function() {
		return this.h != null;
	}, next : function() {
		if(this.h == null) return null;
		var x = this.h[0];
		this.h = this.h[1];
		return x;
	}};
}
List.prototype.toString = function() {
	var s = new StringBuf();
	var first = true;
	var l = this.h;
	s.b[s.b.length] = "{";
	while(l != null) {
		if(first) first = false; else s.b[s.b.length] = ", ";
		s.b[s.b.length] = Std.string(l[0]);
		l = l[1];
	}
	s.b[s.b.length] = "}";
	return s.b.join("");
}
List.prototype.join = function(sep) {
	var s = new StringBuf();
	var first = true;
	var l = this.h;
	while(l != null) {
		if(first) first = false; else s.b[s.b.length] = sep;
		s.b[s.b.length] = l[0];
		l = l[1];
	}
	return s.b.join("");
}
List.prototype.filter = function(f) {
	var l2 = new List();
	var l = this.h;
	while(l != null) {
		var v = l[0];
		l = l[1];
		if(f(v)) l2.add(v);
	}
	return l2;
}
List.prototype.map = function(f) {
	var b = new List();
	var l = this.h;
	while(l != null) {
		var v = l[0];
		l = l[1];
		b.add(f(v));
	}
	return b;
}
List.prototype.__class__ = List;
mt.js.Tip = function() { }
mt.js.Tip.__name__ = ["mt","js","Tip"];
mt.js.Tip.lastRef = null;
mt.js.Tip.placeRef = null;
mt.js.Tip.initialized = null;
mt.js.Tip.tooltip = null;
mt.js.Tip.tooltipContent = null;
mt.js.Tip.mousePos = null;
mt.js.Tip.onHide = null;
mt.js.Tip.excludeList = null;
mt.js.Tip.show = function(refObj,contentHTML,cName,pRef) {
	mt.js.Tip.init();
	if(mt.js.Tip.tooltip == null) {
		mt.js.Tip.tooltip = js.Lib.document.getElementById(mt.js.Tip.tooltipId);
		if(mt.js.Tip.tooltip == null) {
			mt.js.Tip.tooltip = js.Lib.document.createElement("div");
			mt.js.Tip.tooltip.id = mt.js.Tip.tooltipId;
			js.Lib.document.body.insertBefore(mt.js.Tip.tooltip,js.Lib.document.body.firstChild);
		}
		mt.js.Tip.tooltip.style.top = "-1000px";
		mt.js.Tip.tooltip.style.position = "absolute";
		mt.js.Tip.tooltip.style.zIndex = 10;
	}
	if(mt.js.Tip.tooltipContent == null) {
		mt.js.Tip.tooltipContent = js.Lib.document.getElementById(mt.js.Tip.tooltipContentId);
		if(mt.js.Tip.tooltipContent == null) {
			mt.js.Tip.tooltipContent = js.Lib.document.createElement("div");
			mt.js.Tip.tooltipContent.id = mt.js.Tip.tooltipContentId;
			mt.js.Tip.tooltip.appendChild(mt.js.Tip.tooltipContent);
		}
	}
	if(pRef == null) pRef = false;
	mt.js.Tip.placeRef = pRef;
	if(cName == null) mt.js.Tip.tooltip.className = mt.js.Tip.defaultClass; else mt.js.Tip.tooltip.className = cName;
	if(mt.js.Tip.lastRef != null && mt.js.Tip.onHide != null) {
		mt.js.Tip.onHide();
		mt.js.Tip.onHide = null;
	}
	mt.js.Tip.lastRef = refObj;
	mt.js.Tip.tooltipContent.innerHTML = contentHTML;
	if(mt.js.Tip.placeRef) mt.js.Tip.placeTooltipRef(); else mt.js.Tip.placeTooltip();
}
mt.js.Tip.exclude = function(id) {
	var e = js.Lib.document.getElementById(id);
	if(e == null) throw id + " not found";
	if(mt.js.Tip.excludeList == null) mt.js.Tip.excludeList = new List();
	mt.js.Tip.excludeList.add(e);
}
mt.js.Tip.placeTooltip = function() {
	if(mt.js.Tip.mousePos == null) return;
	var tts = mt.js.Tip.elementSize(mt.js.Tip.tooltip);
	var w = mt.js.Tip.windowSize();
	var top = 0;
	var left = 0;
	left = mt.js.Tip.mousePos.x + mt.js.Tip.xOffset;
	top = mt.js.Tip.mousePos.y + mt.js.Tip.yOffset;
	if(top + tts.height > w.height - 2 + w.scrollTop) {
		if(mt.js.Tip.mousePos.y - tts.height > 5 + w.scrollTop) top = mt.js.Tip.mousePos.y - tts.height - 5; else top = w.height - 2 + w.scrollTop - tts.height;
	}
	if(left + tts.width > w.width - 22 + w.scrollLeft) {
		if(mt.js.Tip.mousePos.x - tts.width > 5 + w.scrollLeft) left = mt.js.Tip.mousePos.x - tts.width - 5; else left = w.width - 22 + w.scrollLeft - tts.width;
	}
	if(top < 0) top = 0;
	if(left < 0) left = 0;
	if(mt.js.Tip.excludeList != null) {
		var $it0 = mt.js.Tip.excludeList.iterator();
		while( $it0.hasNext() ) {
			var e = $it0.next();
			var s = mt.js.Tip.elementSize(e);
			if(left > s.x + s.width || left + tts.width < s.x || top > s.y + s.height || top + tts.height < s.y) continue;
			var dx1 = left - (s.x + s.width);
			var dx2 = left + tts.width - s.x;
			var dx = Math.abs(dx1) > Math.abs(dx2)?dx2:dx1;
			var dy1 = top - (s.y + s.height);
			var dy2 = top + tts.height - s.y;
			var dy = Math.abs(dy1) > Math.abs(dy2)?dy2:dy1;
			var cx = left + tts.width / 2 - mt.js.Tip.mousePos.x;
			var cy = top + tts.height / 2 - mt.js.Tip.mousePos.y;
			if((cx - dx) * (cx - dx) + cy * cy > cx * cx + (cy - dy) * (cy - dy)) top -= dy; else left -= dx;
		}
	}
	mt.js.Tip.tooltip.style.left = left + "px";
	mt.js.Tip.tooltip.style.top = top + "px";
}
mt.js.Tip.placeTooltipRef = function() {
	var o = mt.js.Tip.elementSize(mt.js.Tip.lastRef);
	var tts = mt.js.Tip.elementSize(mt.js.Tip.tooltip);
	if(o.width <= 0) mt.js.Tip.tooltip.style.left = o.x + "px"; else mt.js.Tip.tooltip.style.left = o.x - tts.width * 0.5 + o.width * 0.5 + "px";
	mt.js.Tip.tooltip.style.top = o.y + Math.max(mt.js.Tip.minOffsetY,o.height) + "px";
}
mt.js.Tip.showTip = function(refObj,title,contentBase) {
	contentBase = "<p>" + contentBase + "</p>";
	mt.js.Tip.show(refObj,"<div class=\"title\">" + title + "</div>" + contentBase);
}
mt.js.Tip.hide = function() {
	if(mt.js.Tip.lastRef == null) return;
	mt.js.Tip.lastRef = null;
	if(mt.js.Tip.onHide != null) {
		mt.js.Tip.onHide();
		mt.js.Tip.onHide = null;
	}
	mt.js.Tip.tooltip.style.top = "-1000px";
	mt.js.Tip.tooltip.style.width = "";
}
mt.js.Tip.clean = function() {
	if(mt.js.Tip.lastRef == null) return;
	if(mt.js.Tip.lastRef.parentNode == null) return mt.js.Tip.hide();
	if(mt.js.Tip.lastRef.id != null && mt.js.Tip.lastRef.id != "") {
		if(js.Lib.document.getElementById(mt.js.Tip.lastRef.id) != mt.js.Tip.lastRef) return mt.js.Tip.hide();
	}
	return;
}
mt.js.Tip.elementSize = function(o) {
	var ret = { x : 0, y : 0, width : o.clientWidth, height : o.clientHeight};
	var p = o;
	while(p != null) {
		if(p.offsetParent != null) {
			ret.x += p.offsetLeft - p.scrollLeft;
			ret.y += p.offsetTop - p.scrollTop;
		} else {
			ret.x += p.offsetLeft;
			ret.y += p.offsetTop;
		}
		p = p.offsetParent;
	}
	return ret;
}
mt.js.Tip.windowSize = function() {
	var ret = { x : 0, y : 0, width : js.Lib.window.innerWidth, height : js.Lib.window.innerHeight, scrollLeft : js.Lib.document.body.scrollLeft + js.Lib.document.documentElement.scrollLeft, scrollTop : js.Lib.document.body.scrollTop + js.Lib.document.documentElement.scrollTop};
	var body = js.Lib.isIE?js.Lib.document.documentElement:js.Lib.document.body;
	if(ret.width == null) ret.width = body.clientWidth;
	if(ret.height == null) ret.height = body.clientHeight;
	return ret;
}
mt.js.Tip.onMouseMove = function(evt) {
	try {
		var posx = 0;
		var posy = 0;
		if(evt == null) evt = js.Lib.window.event;
		var e = evt;
		if(e.pageX || e.pageY) {
			posx = e.pageX;
			posy = e.pageY;
		} else if(e.clientX || e.clientY) {
			posx = e.clientX + js.Lib.document.body.scrollLeft + js.Lib.document.documentElement.scrollLeft;
			posy = e.clientY + js.Lib.document.body.scrollTop + js.Lib.document.documentElement.scrollTop;
		}
		mt.js.Tip.mousePos = { x : posx, y : posy};
		if(mt.js.Tip.lastRef != null && !mt.js.Tip.placeRef) mt.js.Tip.placeTooltip();
	} catch( e ) {
	}
}
mt.js.Tip.trackMenu = function(elt,onOut) {
	mt.js.Tip.init();
	var ftrack = null;
	var body = js.Lib.document.body;
	ftrack = function(evt) {
		if(mt.js.Tip.mousePos == null) return;
		var size = mt.js.Tip.elementSize(elt);
		if(mt.js.Tip.mousePos.x < size.x || mt.js.Tip.mousePos.y < size.y || mt.js.Tip.mousePos.x > size.x + size.width || mt.js.Tip.mousePos.y > size.y + size.height) {
			if(body.attachEvent) body.detachEvent("onmousemove",ftrack); else body.removeEventListener("mousemove",ftrack,false);
			onOut();
		}
	};
	if(body.attachEvent) body.attachEvent("onmousemove",ftrack); else body.addEventListener("mousemove",ftrack,false);
}
mt.js.Tip.init = function() {
	if(mt.js.Tip.initialized) return;
	if(document.body != null) {
		mt.js.Tip.initialized = true;
		document.body.onmousemove = mt.js.Tip.onMouseMove;
	}
}
mt.js.Tip.prototype.__class__ = mt.js.Tip;
haxe.Http = function(url) {
	if( url === $_ ) return;
	this.url = url;
	this.headers = new Hash();
	this.params = new Hash();
	this.async = true;
}
haxe.Http.__name__ = ["haxe","Http"];
haxe.Http.requestUrl = function(url) {
	var h = new haxe.Http(url);
	h.async = false;
	var r = null;
	h.onData = function(d) {
		r = d;
	};
	h.onError = function(e) {
		throw e;
	};
	h.request(false);
	return r;
}
haxe.Http.prototype.url = null;
haxe.Http.prototype.async = null;
haxe.Http.prototype.postData = null;
haxe.Http.prototype.headers = null;
haxe.Http.prototype.params = null;
haxe.Http.prototype.setHeader = function(header,value) {
	this.headers.set(header,value);
}
haxe.Http.prototype.setParameter = function(param,value) {
	this.params.set(param,value);
}
haxe.Http.prototype.setPostData = function(data) {
	this.postData = data;
}
haxe.Http.prototype.request = function(post) {
	var me = this;
	var r = new js.XMLHttpRequest();
	var onreadystatechange = function() {
		if(r.readyState != 4) return;
		var s = (function($this) {
			var $r;
			try {
				$r = r.status;
			} catch( e ) {
				$r = null;
			}
			return $r;
		}(this));
		if(s == undefined) s = null;
		if(s != null) me.onStatus(s);
		if(s != null && s >= 200 && s < 400) me.onData(r.responseText); else switch(s) {
		case null: case undefined:
			me.onError("Failed to connect or resolve host");
			break;
		case 12029:
			me.onError("Failed to connect to host");
			break;
		case 12007:
			me.onError("Unknown host");
			break;
		default:
			me.onError("Http Error #" + r.status);
		}
	};
	if(this.async) r.onreadystatechange = onreadystatechange;
	var uri = this.postData;
	if(uri != null) post = true; else {
		var $it0 = this.params.keys();
		while( $it0.hasNext() ) {
			var p = $it0.next();
			if(uri == null) uri = ""; else uri += "&";
			uri += StringTools.urlDecode(p) + "=" + StringTools.urlEncode(this.params.get(p));
		}
	}
	try {
		if(post) r.open("POST",this.url,this.async); else if(uri != null) {
			var question = this.url.split("?").length <= 1;
			r.open("GET",this.url + (question?"?":"&") + uri,this.async);
			uri = null;
		} else r.open("GET",this.url,this.async);
	} catch( e ) {
		this.onError(e.toString());
		return;
	}
	if(this.headers.get("Content-Type") == null && post && this.postData == null) r.setRequestHeader("Content-Type","application/x-www-form-urlencoded");
	var $it1 = this.headers.keys();
	while( $it1.hasNext() ) {
		var h = $it1.next();
		r.setRequestHeader(h,this.headers.get(h));
	}
	r.send(uri);
	if(!this.async) onreadystatechange();
}
haxe.Http.prototype.onData = function(data) {
}
haxe.Http.prototype.onError = function(msg) {
}
haxe.Http.prototype.onStatus = function(status) {
}
haxe.Http.prototype.__class__ = haxe.Http;
if(typeof js=='undefined') js = {}
js.Lib = function() { }
js.Lib.__name__ = ["js","Lib"];
js.Lib.isIE = null;
js.Lib.isOpera = null;
js.Lib.document = null;
js.Lib.window = null;
js.Lib.alert = function(v) {
	alert(js.Boot.__string_rec(v,""));
}
js.Lib.eval = function(code) {
	return eval(code);
}
js.Lib.setErrorHandler = function(f) {
	js.Lib.onerror = f;
}
js.Lib.prototype.__class__ = js.Lib;
js.Boot = function() { }
js.Boot.__name__ = ["js","Boot"];
js.Boot.__unhtml = function(s) {
	return s.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}
js.Boot.__trace = function(v,i) {
	var msg = i != null?i.fileName + ":" + i.lineNumber + ": ":"";
	msg += js.Boot.__unhtml(js.Boot.__string_rec(v,"")) + "<br/>";
	var d = document.getElementById("haxe:trace");
	if(d == null) alert("No haxe:trace element defined\n" + msg); else d.innerHTML += msg;
}
js.Boot.__clear_trace = function() {
	var d = document.getElementById("haxe:trace");
	if(d != null) d.innerHTML = "";
}
js.Boot.__closure = function(o,f) {
	var m = o[f];
	if(m == null) return null;
	var f1 = function() {
		return m.apply(o,arguments);
	};
	f1.scope = o;
	f1.method = m;
	return f1;
}
js.Boot.__string_rec = function(o,s) {
	if(o == null) return "null";
	if(s.length >= 5) return "<...>";
	var t = typeof(o);
	if(t == "function" && (o.__name__ != null || o.__ename__ != null)) t = "object";
	switch(t) {
	case "object":
		if(o instanceof Array) {
			if(o.__enum__ != null) {
				if(o.length == 2) return o[0];
				var str = o[0] + "(";
				s += "\t";
				var _g1 = 2, _g = o.length;
				while(_g1 < _g) {
					var i = _g1++;
					if(i != 2) str += "," + js.Boot.__string_rec(o[i],s); else str += js.Boot.__string_rec(o[i],s);
				}
				return str + ")";
			}
			var l = o.length;
			var i;
			var str = "[";
			s += "\t";
			var _g = 0;
			while(_g < l) {
				var i1 = _g++;
				str += (i1 > 0?",":"") + js.Boot.__string_rec(o[i1],s);
			}
			str += "]";
			return str;
		}
		var tostr;
		try {
			tostr = o.toString;
		} catch( e ) {
			return "???";
		}
		if(tostr != null && tostr != Object.toString) {
			var s2 = o.toString();
			if(s2 != "[object Object]") return s2;
		}
		var k = null;
		var str = "{\n";
		s += "\t";
		var hasp = o.hasOwnProperty != null;
		for( var k in o ) { ;
		if(hasp && !o.hasOwnProperty(k)) {
			continue;
		}
		if(k == "prototype" || k == "__class__" || k == "__super__" || k == "__interfaces__") {
			continue;
		}
		if(str.length != 2) str += ", \n";
		str += s + k + " : " + js.Boot.__string_rec(o[k],s);
		}
		s = s.substring(1);
		str += "\n" + s + "}";
		return str;
	case "function":
		return "<function>";
	case "string":
		return o;
	default:
		return String(o);
	}
}
js.Boot.__interfLoop = function(cc,cl) {
	if(cc == null) return false;
	if(cc == cl) return true;
	var intf = cc.__interfaces__;
	if(intf != null) {
		var _g1 = 0, _g = intf.length;
		while(_g1 < _g) {
			var i = _g1++;
			var i1 = intf[i];
			if(i1 == cl || js.Boot.__interfLoop(i1,cl)) return true;
		}
	}
	return js.Boot.__interfLoop(cc.__super__,cl);
}
js.Boot.__instanceof = function(o,cl) {
	try {
		if(o instanceof cl) {
			if(cl == Array) return o.__enum__ == null;
			return true;
		}
		if(js.Boot.__interfLoop(o.__class__,cl)) return true;
	} catch( e ) {
		if(cl == null) return false;
	}
	switch(cl) {
	case Int:
		return Math.ceil(o%2147483648.0) === o;
	case Float:
		return typeof(o) == "number";
	case Bool:
		return o === true || o === false;
	case String:
		return typeof(o) == "string";
	case Dynamic:
		return true;
	default:
		if(o == null) return false;
		return o.__enum__ == cl || cl == Class && o.__name__ != null || cl == Enum && o.__ename__ != null;
	}
}
js.Boot.__init = function() {
	js.Lib.isIE = typeof document!='undefined' && document.all != null && typeof window!='undefined' && window.opera == null;
	js.Lib.isOpera = typeof window!='undefined' && window.opera != null;
	Array.prototype.copy = Array.prototype.slice;
	Array.prototype.insert = function(i,x) {
		this.splice(i,0,x);
	};
	Array.prototype.remove = Array.prototype.indexOf?function(obj) {
		var idx = this.indexOf(obj);
		if(idx == -1) return false;
		this.splice(idx,1);
		return true;
	}:function(obj) {
		var i = 0;
		var l = this.length;
		while(i < l) {
			if(this[i] == obj) {
				this.splice(i,1);
				return true;
			}
			i++;
		}
		return false;
	};
	Array.prototype.iterator = function() {
		return { cur : 0, arr : this, hasNext : function() {
			return this.cur < this.arr.length;
		}, next : function() {
			return this.arr[this.cur++];
		}};
	};
	if(String.prototype.cca == null) String.prototype.cca = String.prototype.charCodeAt;
	String.prototype.charCodeAt = function(i) {
		var x = this.cca(i);
		if(x != x) return null;
		return x;
	};
	var oldsub = String.prototype.substr;
	String.prototype.substr = function(pos,len) {
		if(pos != null && pos != 0 && len != null && len < 0) return "";
		if(len == null) len = this.length;
		if(pos < 0) {
			pos = this.length + pos;
			if(pos < 0) pos = 0;
		} else if(len < 0) len = this.length + len - pos;
		return oldsub.apply(this,[pos,len]);
	};
	$closure = js.Boot.__closure;
}
js.Boot.prototype.__class__ = js.Boot;
IntHash = function(p) {
	if( p === $_ ) return;
	this.h = {}
	if(this.h.__proto__ != null) {
		this.h.__proto__ = null;
		delete(this.h.__proto__);
	}
}
IntHash.__name__ = ["IntHash"];
IntHash.prototype.h = null;
IntHash.prototype.set = function(key,value) {
	this.h[key] = value;
}
IntHash.prototype.get = function(key) {
	return this.h[key];
}
IntHash.prototype.exists = function(key) {
	return this.h[key] != null;
}
IntHash.prototype.remove = function(key) {
	if(this.h[key] == null) return false;
	delete(this.h[key]);
	return true;
}
IntHash.prototype.keys = function() {
	var a = new Array();
	for( x in this.h ) a.push(x);
	return a.iterator();
}
IntHash.prototype.iterator = function() {
	return { ref : this.h, it : this.keys(), hasNext : function() {
		return this.it.hasNext();
	}, next : function() {
		var i = this.it.next();
		return this.ref[i];
	}};
}
IntHash.prototype.toString = function() {
	var s = new StringBuf();
	s.b[s.b.length] = "{";
	var it = this.keys();
	while( it.hasNext() ) {
		var i = it.next();
		s.b[s.b.length] = i;
		s.b[s.b.length] = " => ";
		s.b[s.b.length] = Std.string(this.get(i));
		if(it.hasNext()) s.b[s.b.length] = ", ";
	}
	s.b[s.b.length] = "}";
	return s.b.join("");
}
IntHash.prototype.__class__ = IntHash;
haxe.Md5 = function(p) {
}
haxe.Md5.__name__ = ["haxe","Md5"];
haxe.Md5.encode = function(s) {
	return new haxe.Md5().doEncode(s);
}
haxe.Md5.prototype.bitOR = function(a,b) {
	var lsb = a & 1 | b & 1;
	var msb31 = a >>> 1 | b >>> 1;
	return msb31 << 1 | lsb;
}
haxe.Md5.prototype.bitXOR = function(a,b) {
	var lsb = a & 1 ^ b & 1;
	var msb31 = a >>> 1 ^ b >>> 1;
	return msb31 << 1 | lsb;
}
haxe.Md5.prototype.bitAND = function(a,b) {
	var lsb = a & 1 & (b & 1);
	var msb31 = a >>> 1 & b >>> 1;
	return msb31 << 1 | lsb;
}
haxe.Md5.prototype.addme = function(x,y) {
	var lsw = (x & 65535) + (y & 65535);
	var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
	return msw << 16 | lsw & 65535;
}
haxe.Md5.prototype.rhex = function(num) {
	var str = "";
	var hex_chr = "0123456789abcdef";
	var _g = 0;
	while(_g < 4) {
		var j = _g++;
		str += hex_chr.charAt(num >> j * 8 + 4 & 15) + hex_chr.charAt(num >> j * 8 & 15);
	}
	return str;
}
haxe.Md5.prototype.str2blks = function(str) {
	var nblk = (str.length + 8 >> 6) + 1;
	var blks = new Array();
	var _g1 = 0, _g = nblk * 16;
	while(_g1 < _g) {
		var i = _g1++;
		blks[i] = 0;
	}
	var i = 0;
	while(i < str.length) {
		blks[i >> 2] |= str.charCodeAt(i) << (str.length * 8 + i) % 4 * 8;
		i++;
	}
	blks[i >> 2] |= 128 << (str.length * 8 + i) % 4 * 8;
	var l = str.length * 8;
	var k = nblk * 16 - 2;
	blks[k] = l & 255;
	blks[k] |= (l >>> 8 & 255) << 8;
	blks[k] |= (l >>> 16 & 255) << 16;
	blks[k] |= (l >>> 24 & 255) << 24;
	return blks;
}
haxe.Md5.prototype.rol = function(num,cnt) {
	return num << cnt | num >>> 32 - cnt;
}
haxe.Md5.prototype.cmn = function(q,a,b,x,s,t) {
	return this.addme(this.rol(this.addme(this.addme(a,q),this.addme(x,t)),s),b);
}
haxe.Md5.prototype.ff = function(a,b,c,d,x,s,t) {
	return this.cmn(this.bitOR(this.bitAND(b,c),this.bitAND(~b,d)),a,b,x,s,t);
}
haxe.Md5.prototype.gg = function(a,b,c,d,x,s,t) {
	return this.cmn(this.bitOR(this.bitAND(b,d),this.bitAND(c,~d)),a,b,x,s,t);
}
haxe.Md5.prototype.hh = function(a,b,c,d,x,s,t) {
	return this.cmn(this.bitXOR(this.bitXOR(b,c),d),a,b,x,s,t);
}
haxe.Md5.prototype.ii = function(a,b,c,d,x,s,t) {
	return this.cmn(this.bitXOR(c,this.bitOR(b,~d)),a,b,x,s,t);
}
haxe.Md5.prototype.doEncode = function(str) {
	var x = this.str2blks(str);
	var a = 1732584193;
	var b = -271733879;
	var c = -1732584194;
	var d = 271733878;
	var step;
	var i = 0;
	while(i < x.length) {
		var olda = a;
		var oldb = b;
		var oldc = c;
		var oldd = d;
		step = 0;
		a = this.ff(a,b,c,d,x[i],7,-680876936);
		d = this.ff(d,a,b,c,x[i + 1],12,-389564586);
		c = this.ff(c,d,a,b,x[i + 2],17,606105819);
		b = this.ff(b,c,d,a,x[i + 3],22,-1044525330);
		a = this.ff(a,b,c,d,x[i + 4],7,-176418897);
		d = this.ff(d,a,b,c,x[i + 5],12,1200080426);
		c = this.ff(c,d,a,b,x[i + 6],17,-1473231341);
		b = this.ff(b,c,d,a,x[i + 7],22,-45705983);
		a = this.ff(a,b,c,d,x[i + 8],7,1770035416);
		d = this.ff(d,a,b,c,x[i + 9],12,-1958414417);
		c = this.ff(c,d,a,b,x[i + 10],17,-42063);
		b = this.ff(b,c,d,a,x[i + 11],22,-1990404162);
		a = this.ff(a,b,c,d,x[i + 12],7,1804603682);
		d = this.ff(d,a,b,c,x[i + 13],12,-40341101);
		c = this.ff(c,d,a,b,x[i + 14],17,-1502002290);
		b = this.ff(b,c,d,a,x[i + 15],22,1236535329);
		a = this.gg(a,b,c,d,x[i + 1],5,-165796510);
		d = this.gg(d,a,b,c,x[i + 6],9,-1069501632);
		c = this.gg(c,d,a,b,x[i + 11],14,643717713);
		b = this.gg(b,c,d,a,x[i],20,-373897302);
		a = this.gg(a,b,c,d,x[i + 5],5,-701558691);
		d = this.gg(d,a,b,c,x[i + 10],9,38016083);
		c = this.gg(c,d,a,b,x[i + 15],14,-660478335);
		b = this.gg(b,c,d,a,x[i + 4],20,-405537848);
		a = this.gg(a,b,c,d,x[i + 9],5,568446438);
		d = this.gg(d,a,b,c,x[i + 14],9,-1019803690);
		c = this.gg(c,d,a,b,x[i + 3],14,-187363961);
		b = this.gg(b,c,d,a,x[i + 8],20,1163531501);
		a = this.gg(a,b,c,d,x[i + 13],5,-1444681467);
		d = this.gg(d,a,b,c,x[i + 2],9,-51403784);
		c = this.gg(c,d,a,b,x[i + 7],14,1735328473);
		b = this.gg(b,c,d,a,x[i + 12],20,-1926607734);
		a = this.hh(a,b,c,d,x[i + 5],4,-378558);
		d = this.hh(d,a,b,c,x[i + 8],11,-2022574463);
		c = this.hh(c,d,a,b,x[i + 11],16,1839030562);
		b = this.hh(b,c,d,a,x[i + 14],23,-35309556);
		a = this.hh(a,b,c,d,x[i + 1],4,-1530992060);
		d = this.hh(d,a,b,c,x[i + 4],11,1272893353);
		c = this.hh(c,d,a,b,x[i + 7],16,-155497632);
		b = this.hh(b,c,d,a,x[i + 10],23,-1094730640);
		a = this.hh(a,b,c,d,x[i + 13],4,681279174);
		d = this.hh(d,a,b,c,x[i],11,-358537222);
		c = this.hh(c,d,a,b,x[i + 3],16,-722521979);
		b = this.hh(b,c,d,a,x[i + 6],23,76029189);
		a = this.hh(a,b,c,d,x[i + 9],4,-640364487);
		d = this.hh(d,a,b,c,x[i + 12],11,-421815835);
		c = this.hh(c,d,a,b,x[i + 15],16,530742520);
		b = this.hh(b,c,d,a,x[i + 2],23,-995338651);
		a = this.ii(a,b,c,d,x[i],6,-198630844);
		d = this.ii(d,a,b,c,x[i + 7],10,1126891415);
		c = this.ii(c,d,a,b,x[i + 14],15,-1416354905);
		b = this.ii(b,c,d,a,x[i + 5],21,-57434055);
		a = this.ii(a,b,c,d,x[i + 12],6,1700485571);
		d = this.ii(d,a,b,c,x[i + 3],10,-1894986606);
		c = this.ii(c,d,a,b,x[i + 10],15,-1051523);
		b = this.ii(b,c,d,a,x[i + 1],21,-2054922799);
		a = this.ii(a,b,c,d,x[i + 8],6,1873313359);
		d = this.ii(d,a,b,c,x[i + 15],10,-30611744);
		c = this.ii(c,d,a,b,x[i + 6],15,-1560198380);
		b = this.ii(b,c,d,a,x[i + 13],21,1309151649);
		a = this.ii(a,b,c,d,x[i + 4],6,-145523070);
		d = this.ii(d,a,b,c,x[i + 11],10,-1120210379);
		c = this.ii(c,d,a,b,x[i + 2],15,718787259);
		b = this.ii(b,c,d,a,x[i + 9],21,-343485551);
		a = this.addme(a,olda);
		b = this.addme(b,oldb);
		c = this.addme(c,oldc);
		d = this.addme(d,oldd);
		i += 16;
	}
	return this.rhex(a) + this.rhex(b) + this.rhex(c) + this.rhex(d);
}
haxe.Md5.prototype.__class__ = haxe.Md5;
EReg = function(r,opt) {
	if( r === $_ ) return;
	opt = opt.split("u").join("");
	this.r = new RegExp(r,opt);
}
EReg.__name__ = ["EReg"];
EReg.prototype.r = null;
EReg.prototype.match = function(s) {
	this.r.m = this.r.exec(s);
	this.r.s = s;
	this.r.l = RegExp.leftContext;
	this.r.r = RegExp.rightContext;
	return this.r.m != null;
}
EReg.prototype.matched = function(n) {
	return this.r.m != null && n >= 0 && n < this.r.m.length?this.r.m[n]:(function($this) {
		var $r;
		throw "EReg::matched";
		return $r;
	}(this));
}
EReg.prototype.matchedLeft = function() {
	if(this.r.m == null) throw "No string matched";
	if(this.r.l == null) return this.r.s.substr(0,this.r.m.index);
	return this.r.l;
}
EReg.prototype.matchedRight = function() {
	if(this.r.m == null) throw "No string matched";
	if(this.r.r == null) {
		var sz = this.r.m.index + this.r.m[0].length;
		return this.r.s.substr(sz,this.r.s.length - sz);
	}
	return this.r.r;
}
EReg.prototype.matchedPos = function() {
	if(this.r.m == null) throw "No string matched";
	return { pos : this.r.m.index, len : this.r.m[0].length};
}
EReg.prototype.split = function(s) {
	var d = "#__delim__#";
	return s.replace(this.r,d).split(d);
}
EReg.prototype.replace = function(s,by) {
	return s.replace(this.r,by);
}
EReg.prototype.customReplace = function(s,f) {
	var buf = new StringBuf();
	while(true) {
		if(!this.match(s)) break;
		buf.b[buf.b.length] = this.matchedLeft();
		buf.b[buf.b.length] = f(this);
		s = this.matchedRight();
	}
	buf.b[buf.b.length] = s;
	return buf.b.join("");
}
EReg.prototype.__class__ = EReg;
js.App = function(p) {
	if( p === $_ ) return;
	this.adIndex = 0;
	this.adLock = 0;
	this.oldTips = new Hash();
}
js.App.__name__ = ["js","App"];
js.App.j = function(v) {
	return new js.JQuery(v);
}
js.App.main = function() {
	_ = new js.App();
}
js.App.prototype.adIndex = null;
js.App.prototype.adLock = null;
js.App.prototype.onTrooperSelected = null;
js.App.prototype.oldTips = null;
js.App.prototype.toggle = function(id) {
	var elt = js.Lib.document.getElementById(id);
	elt.style.display = elt.style.display == "none"?"":"none";
	return false;
}
js.App.prototype.showTip = function(t,v) {
	var e = js.Lib.document.getElementById(t);
	if(!this.oldTips.exists(t)) this.oldTips.set(t,e.innerHTML);
	e.innerHTML = v;
	e.parentNode.style.display = "";
}
js.App.prototype.resetTip = function(t) {
	var v = this.oldTips.get(t);
	var e = js.Lib.document.getElementById(t);
	e.innerHTML = v;
	e.parentNode.style.display = v == ""?"none":"";
}
js.App.prototype.selectTrooper = function(tid,tval) {
	new js.JQuery("#tselect").val("" + tval);
	new js.JQuery(".trSelected").removeClass("trSelected");
	new js.JQuery("#tr_" + tid).addClass("trSelected");
	this.onTrooperSelected();
}
js.App.prototype.initCreate = function(host) {
	var name = new js.JQuery("input#name");
	var valid = new js.JQuery("input#submit");
	var chk = new js.JQuery(".host");
	var cache = new Hash();
	name.focus();
	var timer = new haxe.Timer(30);
	var current = "";
	var wait = 0;
	var errors = 1;
	this.onTrooperSelected = function() {
		current = null;
	};
	timer.run = function() {
		var t = Common.host(name.val());
		if(t == current) {
			wait++;
			if(wait == 30 && !cache.exists(t)) {
				if(!Common.hostValid(t)) {
					cache.set(t,false);
					current = null;
					return;
				}
				cache.set(t,null);
				var h = new haxe.Http("/check");
				h.setParameter("name",t);
				h.onData = function(r) {
					var v;
					switch(r) {
					case "free":
						v = true;
						break;
					case "used":
						v = false;
						break;
					default:
						cache.remove(t);
						errors *= 2;
						wait = -errors;
						return;
					}
					cache.set(t,v);
					if(t != current) return;
					current = null;
				};
				h.request(false);
			}
			return;
		}
		current = t;
		chk.removeClass("free").removeClass("used");
		valid.attr("disabled","disabled");
		valid.addClass("button_off");
		if(cache.exists(t)) {
			wait = 1000;
			var v = cache.get(t);
			if(v != null) chk.addClass(v?"free":"used");
			if(v && new js.JQuery("#tselect").val() != "") {
				valid.removeClass("button_off");
				valid.removeAttr("disabled");
			}
		} else wait = 0;
		if(t == "") chk.hide(); else {
			chk.show();
			new js.JQuery(".hostname").text("http://" + t + "." + host);
		}
	};
}
js.App.prototype.startRecruit = function() {
	var h = new haxe.Http("/recruit");
	h.onData = function(data) {
		if(StringTools.startsWith(data,"<!DOC")) js.Lib.document.write(data); else {
			new js.JQuery("#recruit").html(data);
			new js.JQuery("body").addClass("hideSwf");
		}
	};
	h.request(false);
}
js.App.prototype.adCycle = function(seed,down) {
	this.adLock++;
	if(this.adLock > 1) return;
	var me = this;
	if(down) this.adIndex--;
	var h = new haxe.Http("/ads");
	h.setParameter("seed",seed);
	h.setParameter("index",Std.string(this.adIndex));
	if(!down) this.adIndex++;
	h.onData = function(data) {
		if(StringTools.startsWith(data,"<!DOC")) js.Lib.document.write(data); else {
			new js.JQuery("#xds").html(data);
			if(!down) new js.JQuery("#xds ul").animate({ marginLeft : -232},1000,(function(f,a1,a2) {
				return function() {
					return f(a1,a2);
				};
			})($closure(me,"adCycleDone"),seed,down)); else {
				new js.JQuery("#xds ul").css("margin-left","-232px");
				new js.JQuery("#xds ul").animate({ marginLeft : 0},1000,(function(f,a1,a2) {
					return function() {
						return f(a1,a2);
					};
				})($closure(me,"adCycleDone"),seed,down));
			}
		}
	};
	h.request(false);
}
js.App.prototype.adCycleDone = function(seed,down) {
	this.adLock--;
	if(this.adLock > 0) {
		this.adLock = 0;
		this.adCycle(seed,down);
	}
}
js.App.prototype.deltaMoney = function(m) {
	var t = new haxe.Timer(30);
	t.run = function() {
		if(m <= 0) {
			t.stop();
			return;
		}
		var t1 = new js.JQuery("#targetMoney");
		t1.html(Std.string(Std.parseInt(t1.html()) + 1));
		m--;
	};
}
js.App.prototype.hideNotif = function() {
	new js.JQuery("body").removeClass("hideSwf");
	new js.JQuery("#notification").remove();
	return false;
}
js.App.prototype.swfAction = function(swf,name) {
	var fobj = window.document[swf];
	if(fobj == null) fobj = window.document.getElementById(swf);
	if(fobj == null) throw "Could not find flash object '" + swf + "'";
	fobj[name]();
}
js.App.prototype.detailsCache = null;
js.App.prototype.detailsCurrent = null;
js.App.prototype.showDetails = function(id) {
	if(this.detailsCache == null) this.detailsCache = new IntHash();
	this.detailsCurrent = id;
	var data = this.detailsCache.get(id);
	if(data != null) {
		new js.JQuery("#trhome").html(data);
		return;
	}
	var me = this;
	var h = new haxe.Http("/details");
	h.setParameter("t",Std.string(id));
	h.onData = function(data1) {
		if(data1.substr(0,5) == "<!DOC") return;
		me.detailsCache.set(id,data1);
		if(me.detailsCurrent == id) me.showDetails(id);
	};
	h.request(false);
}
js.App.prototype.__class__ = js.App;
Hash = function(p) {
	if( p === $_ ) return;
	this.h = {}
	if(this.h.__proto__ != null) {
		this.h.__proto__ = null;
		delete(this.h.__proto__);
	}
}
Hash.__name__ = ["Hash"];
Hash.prototype.h = null;
Hash.prototype.set = function(key,value) {
	this.h["$" + key] = value;
}
Hash.prototype.get = function(key) {
	return this.h["$" + key];
}
Hash.prototype.exists = function(key) {
	try {
		key = "$" + key;
		return this.hasOwnProperty.call(this.h,key);
	} catch( e ) {
		for(var i in this.h) if( i == key ) return true;
		return false;
	}
}
Hash.prototype.remove = function(key) {
	if(!this.exists(key)) return false;
	delete(this.h["$" + key]);
	return true;
}
Hash.prototype.keys = function() {
	var a = new Array();
	for(var i in this.h) a.push(i.substr(1));
	return a.iterator();
}
Hash.prototype.iterator = function() {
	return { ref : this.h, it : this.keys(), hasNext : function() {
		return this.it.hasNext();
	}, next : function() {
		var i = this.it.next();
		return this.ref["$" + i];
	}};
}
Hash.prototype.toString = function() {
	var s = new StringBuf();
	s.b[s.b.length] = "{";
	var it = this.keys();
	while( it.hasNext() ) {
		var i = it.next();
		s.b[s.b.length] = i;
		s.b[s.b.length] = " => ";
		s.b[s.b.length] = Std.string(this.get(i));
		if(it.hasNext()) s.b[s.b.length] = ", ";
	}
	s.b[s.b.length] = "}";
	return s.b.join("");
}
Hash.prototype.__class__ = Hash;
$_ = {}
js.Boot.__res = {}
js.Boot.__init();
{
	var d = Date;
	d.now = function() {
		return new Date();
	};
	d.fromTime = function(t) {
		var d1 = new Date();
		d1["setTime"](t);
		return d1;
	};
	d.fromString = function(s) {
		switch(s.length) {
		case 8:
			var k = s.split(":");
			var d1 = new Date();
			d1["setTime"](0);
			d1["setUTCHours"](k[0]);
			d1["setUTCMinutes"](k[1]);
			d1["setUTCSeconds"](k[2]);
			return d1;
		case 10:
			var k = s.split("-");
			return new Date(k[0],k[1] - 1,k[2],0,0,0);
		case 19:
			var k = s.split(" ");
			var y = k[0].split("-");
			var t = k[1].split(":");
			return new Date(y[0],y[1] - 1,y[2],t[0],t[1],t[2]);
		default:
			throw "Invalid date format : " + s;
		}
	};
	d.prototype["toString"] = function() {
		var date = this;
		var m = date.getMonth() + 1;
		var d1 = date.getDate();
		var h = date.getHours();
		var mi = date.getMinutes();
		var s = date.getSeconds();
		return date.getFullYear() + "-" + (m < 10?"0" + m:"" + m) + "-" + (d1 < 10?"0" + d1:"" + d1) + " " + (h < 10?"0" + h:"" + h) + ":" + (mi < 10?"0" + mi:"" + mi) + ":" + (s < 10?"0" + s:"" + s);
	};
	d.prototype.__class__ = d;
	d.__name__ = ["Date"];
}
{
	String.prototype.__class__ = String;
	String.__name__ = ["String"];
	Array.prototype.__class__ = Array;
	Array.__name__ = ["Array"];
	Int = { __name__ : ["Int"]};
	Dynamic = { __name__ : ["Dynamic"]};
	Float = Number;
	Float.__name__ = ["Float"];
	Bool = { __ename__ : ["Bool"]};
	Class = { __name__ : ["Class"]};
	Enum = { };
	Void = { __ename__ : ["Void"]};
}
{
	Math.__name__ = ["Math"];
	Math.NaN = Number["NaN"];
	Math.NEGATIVE_INFINITY = Number["NEGATIVE_INFINITY"];
	Math.POSITIVE_INFINITY = Number["POSITIVE_INFINITY"];
	Math.isFinite = function(i) {
		return isFinite(i);
	};
	Math.isNaN = function(i) {
		return isNaN(i);
	};
}
mt.js.Tip.init();
{
	js.Lib.document = document;
	js.Lib.window = window;
	onerror = function(msg,url,line) {
		var f = js.Lib.onerror;
		if( f == null )
			return false;
		return f(msg,[url+":"+line]);
	}
}
{
	var q = window.jQuery;
	js.JQuery = q;
	q.fn.noBubble = q.fn.bind;
	q.fn.loadURL = q.fn.load;
	q.fn.toggleClick = q.fn.toggle;
	q.of = q;
}
js["XMLHttpRequest"] = window.XMLHttpRequest?XMLHttpRequest:window.ActiveXObject?function() {
	try {
		return new ActiveXObject("Msxml2.XMLHTTP");
	} catch( e ) {
		try {
			return new ActiveXObject("Microsoft.XMLHTTP");
		} catch( e1 ) {
			throw "Unable to create XMLHttpRequest object.";
		}
	}
}:(function($this) {
	var $r;
	throw "Unable to create XMLHttpRequest object.";
	return $r;
}(this));
haxe.Timer.arr = new Array();
mt.js.Timer.timers = new Array();
mt.js.Timer.TIMES = "jhms";
mt.js.Tip.xOffset = 3;
mt.js.Tip.yOffset = 22;
mt.js.Tip.defaultClass = "normalTip";
mt.js.Tip.tooltipId = "tooltip";
mt.js.Tip.tooltipContentId = "tooltipContent";
mt.js.Tip.minOffsetY = 23;
js.Lib.onerror = null;
js.App.ref = [mt.js.Tip,js.JQuery,mt.js.Timer,haxe.Md5];
js.App.main()