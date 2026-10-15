// Copyright 2026 Ben Houston
// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';import{createRequire}from'node:module';const require=createRequire(import.meta.url),sharp=require('sharp');
const app=(marker,bytes)=>{const h=Buffer.alloc(4);h[0]=255;h[1]=marker;h.writeUInt16BE(bytes.length+2,2);return Buffer.concat([h,bytes]);};
const xmp=xml=>app(0xe1,Buffer.from('http://ns.adobe.com/xap/1.0/\0'+xml));
const wrap=inner=>`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${inner}</rdf:RDF></x:xmpmeta>`;
const base=await sharp(Buffer.alloc(16*16*3,128),{raw:{width:16,height:16,channels:3}}).withIccProfile('srgb').jpeg({quality:100,chromaSubsampling:'4:4:4'}).toBuffer();
const gain=await sharp(Buffer.alloc(16*16,255),{raw:{width:16,height:16,channels:1}}).greyscale().jpeg({quality:100}).toBuffer();
const s=128/255,linear=((s+.055)/1.055)**2.4,max=Math.log2(4/linear);
const gx=xmp(wrap(`<rdf:Description xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:Version="1.0" hdrgm:BaseRenditionIsHDR="False" hdrgm:GainMapMin="0" hdrgm:GainMapMax="${max}" hdrgm:Gamma="1" hdrgm:OffsetSDR="0" hdrgm:OffsetHDR="0" hdrgm:HDRCapacityMin="0" hdrgm:HDRCapacityMax="${max}"/>`));
const secondary=Buffer.concat([gain.subarray(0,2),gx,gain.subarray(2)]);
const px=xmp(wrap(`<rdf:Description xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" xmlns:Container="http://ns.google.com/photos/1.0/container/" xmlns:Item="http://ns.google.com/photos/1.0/container/item/" hdrgm:Version="1.0"><Container:Directory><rdf:Seq><rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="Primary" Item:Mime="image/jpeg"/></rdf:li><rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="GainMap" Item:Mime="image/jpeg" Item:Length="${secondary.length}"/></rdf:li></rdf:Seq></Container:Directory></rdf:Description>`));
const tiff=Buffer.alloc(82);tiff.write('MM');tiff.writeUInt16BE(42,2);tiff.writeUInt32BE(8,4);tiff.writeUInt16BE(3,8);
const tag=(o,id,type,count,value)=>{tiff.writeUInt16BE(id,o);tiff.writeUInt16BE(type,o+2);tiff.writeUInt32BE(count,o+4);tiff.writeUInt32BE(value,o+8);};
tag(10,0xb000,7,4,0x30313030);tag(22,0xb001,4,1,2);tag(34,0xb002,7,32,50);
const primaryLength=base.length+px.length+90;const tiffStart=2+px.length+8;
tiff.writeUInt32BE(0x20030000,50);tiff.writeUInt32BE(primaryLength,54);tiff.writeUInt32BE(0,58);tiff.writeUInt32BE(0,66);tiff.writeUInt32BE(secondary.length,70);tiff.writeUInt32BE(primaryLength-tiffStart,74);
const mpf=app(0xe2,Buffer.concat([Buffer.from('MPF\0'),tiff]));const bytes=Buffer.concat([base.subarray(0,2),px,mpf,base.subarray(2),secondary]);
fs.writeFileSync(new URL('linear-hdr.jpg', import.meta.url), bytes);
console.log(`Wrote ${bytes.length} bytes; full linear HDR RGB = 4.`);
