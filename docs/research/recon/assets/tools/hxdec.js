// minimal haxe unserializer + MT key deobfuscation
const DICT={"V\x1bE|":"pref","\fA2c":"seed","$PS\x01":"gfx",";\x01\fZ":"mode","An%6":"type","}&\x16Y\x01":"force","\x032\x1A4":"name","7X\x01":"id","\x0bR\x10\x1b\x02":"__CWeapon","\x11!\x0ea\x01":"reloadSystem","\x15S\x17?\x03":"targetType","\x1a)\x13=\x01":"__CBody","\x1dlQK\x03":"moveSystem",")0\x19i\x03":"leftOver",";uXE":"targetSystem",";\x1F\x0FJ":"army","\x05(\x0Bm\x02":"action","Vif0":"ymax","hW+a":"xmax","\x17\x06\t\x01":"fac","\x10Gv\x01":"add","\ng\x12;\x01":"space","\nz\nv":"choices","*M\x01":"bg","a]e\x1B\x02":"armies","`1\x1f*\x02":"troopers","OPz\x16\x03":"faction","K)\x16\n\x02":"__UP2"};
function un(s){let p=0;const strs=[],objs=[];
 const num=()=>{let st=p;if(s[p]=='-')p++;while(p<s.length&&/[0-9]/.test(s[p]))p++;return parseInt(s.slice(st,p));};
 function r(){const c=s[p++];switch(c){
  case 'n':return null;case 't':return true;case 'f':return false;case 'z':return 0;
  case 'i':return num();
  case 'd':{let st=p;while(p<s.length&&/[0-9eE.+\-]/.test(s[p]))p++;return parseFloat(s.slice(st,p));}
  case 'y':{const l=num();p++;const v=decodeURIComponent(s.substr(p,l));p+=l;strs.push(v);return v;}
  case 'R':return strs[num()];
  case 'o':{const o={};objs.push(o);while(s[p]!='g'){let k=r();o[DICT[k]||JSON.stringify(k)]=r();}p++;return o;}
  case 'a':{const a=[];objs.push(a);while(s[p]!='h'){if(s[p]=='u'){p++;const n=num();for(let i=0;i<n;i++)a.push(null);}else a.push(r());}p++;return a;}
  case 'j':{const e=r();p++;const idx=num();p++;const n=num();const args=[];for(let i=0;i<n;i++)args.push(r());return n?{enum:e,idx,args}:e+'#'+idx;}
  case 'w':{const e=r();const c2=r();p++;const n=num();const args=[];for(let i=0;i<n;i++)args.push(r());return {enum:e,ctor:c2,args};}
  case 'r':return '<ref obj '+num()+'>';
  case 'b':{const o={};while(s[p]!='h'){const k=r();o[k]=r();}p++;return {StringMap:o};}
  case 'q':{const o={};while(s[p]!='h'){p++;const k=num();o[k]=r();}p++;return {IntMap:o};}
  case 'x':return {exception:r()};
  case 's':{const l=num();p++;const v=s.substr(p,l);p+=l;return {bytes_b64:v};}
  case 'v':{let v=s.substr(p,19);p+=19;return {date:v};}
  default: throw new Error('bad tag '+c+' at '+(p-1)+' : '+s.slice(p-5,p+20));}}
 const v=r(); return {v,rest:s.slice(p)};}
const fs=require('fs');const html=fs.readFileSync(process.argv[2],'utf8');
const re=/flashvars : '([^']*)'/g;let m,i=0;const only=process.argv[3];
while((m=re.exec(html))){i++; if(only && String(i)!==only) continue; const fv=m[1];const q=new URLSearchParams(fv);const d=q.get('data');
 const other={};for(const [k,v] of q) if(k!=='data') other[k]=v;
 let out;try{out=un(d).v;}catch(e){out='ERR '+e.message;}
 console.log('#'+i, JSON.stringify(other)); console.log(JSON.stringify(out,null,1).slice(0, +process.argv[4]||4000));}
