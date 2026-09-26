import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { inExpoGo } from '@/lib/fb/runtime';
import type { LatLng } from '@/lib/geo';

/**
 * Expo Go on Android draws react-native-maps as a blank grey/black box (a known SDK 57 bug,
 * expo/expo#49323), so there the maps fall back to this: Leaflet + OpenStreetMap tiles in a WebView.
 * Dev and store builds keep the native Google / Apple map. EXPO_PUBLIC_WEB_MAPS=1 forces it anywhere (for testing).
 */
export const webMaps = (Platform.OS === 'android' && inExpoGo) || process.env.EXPO_PUBLIC_WEB_MAPS === '1';

export type WebMarker = {
  id: string; at: LatLng; bg: string; border: string;
  icon?: 'home' | 'go' | 'user' | 'dot'; fg?: string; size?: number; title?: string; sub?: string;
};
export type WebCircle = { center: LatLng; radiusM: number; color: string };
export type WebLine = { points: LatLng[]; color: string; width?: number; dashed?: boolean };
export type WebView_ = { center: LatLng; zoom: number } | { fit: LatLng[]; pad?: number; maxZoom?: number };
export type WebMapHandle = { flyTo: (at: LatLng, zoom?: number) => void };

type Props = {
  view: WebView_;
  markers?: WebMarker[]; circles?: WebCircle[]; lines?: WebLine[];
  /** false = a picture of the map (no drag / zoom). */
  interactive?: boolean;
  /** Called with the map centre whenever she stops dragging. */
  onMoveEnd?: (at: LatLng) => void;
};

const ORIGIN = 'https://sahayak.app/';

const page = (init: object) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>html,body,#m{margin:0;height:100%;background:#ECE9E3}.leaflet-control-attribution{font-size:9px!important}.leaflet-popup-content{margin:8px 12px;font:600 13px system-ui}.leaflet-popup-content small{display:block;font-weight:400;color:#666}</style>
</head><body><div id="m"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
var I=${JSON.stringify(init)};
function post(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))}
if(!window.L){post({t:'error'})}else{
var on=I.interactive;
var map=L.map('m',{zoomControl:false,dragging:on,touchZoom:on,doubleClickZoom:on,scrollWheelZoom:false,boxZoom:false,keyboard:false,tap:on});
map.attributionControl.setPrefix(false);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var layer=L.layerGroup().addTo(map);
var ICON={home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',go:'<path d="M3 11 22 2l-9 19-2-8z"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'};
function pin(m){var s=m.size||30,g=Math.round(s*.46);
var inner=(m.icon&&m.icon!=='dot')?'<svg width="'+g+'" height="'+g+'" viewBox="0 0 24 24" fill="none" stroke="'+(m.fg||'#fff')+'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+ICON[m.icon]+'</svg>':'';
return L.divIcon({className:'',iconSize:[s,s],iconAnchor:[s/2,s/2],popupAnchor:[0,-s/2],html:'<div style="width:'+s+'px;height:'+s+'px;box-sizing:border-box;border-radius:50%;background:'+m.bg+';border:3px solid '+m.border+';display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.28)">'+inner+'</div>'})}
window.draw=function(d){layer.clearLayers();
(d.circles||[]).forEach(function(c){L.circle([c.center.lat,c.center.lng],{radius:c.radiusM,color:c.color,weight:1.5,fillColor:c.color,fillOpacity:.12,interactive:false}).addTo(layer)});
(d.lines||[]).forEach(function(l){L.polyline(l.points.map(function(p){return[p.lat,p.lng]}),{color:l.color,weight:l.width||4,dashArray:l.dashed?'2 10':null,lineCap:'round',interactive:false}).addTo(layer)});
(d.markers||[]).forEach(function(m){var k=L.marker([m.at.lat,m.at.lng],{icon:pin(m),interactive:!!m.title,keyboard:false});if(m.title)k.bindPopup(m.title+(m.sub?'<small>'+m.sub+'</small>':''),{closeButton:false});k.addTo(layer)})};
window.view=function(v,anim){if(v.fit&&v.fit.length>1){var p=v.pad||48;map.fitBounds(v.fit.map(function(q){return[q.lat,q.lng]}),{padding:[p,p],animate:anim,maxZoom:v.maxZoom||17})}else{var c=v.center||v.fit[0];map.setView([c.lat,c.lng],v.zoom||16,{animate:anim})}};
window.fly=function(p,z){map.flyTo([p.lat,p.lng],z||map.getZoom(),{duration:.6})};
view(I.view,false);draw(I);
map.on('moveend',function(){var c=map.getCenter();post({t:'move',lat:c.lat,lng:c.lng})});
post({t:'ready'})}
</script></body></html>`;

/** Leaflet map in a WebView with the same pins, rings and lines as the native maps. */
export const WebMap = forwardRef<WebMapHandle, Props>(function WebMap({ view, markers, circles, lines, interactive = true, onMoveEnd }, ref) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [html] = useState(() => page({ view, markers, circles, lines, interactive }));
  const layers = JSON.stringify({ markers, circles, lines });
  const camera = JSON.stringify(view);
  const run = (js: string) => web.current?.injectJavaScript(`try{${js}}catch(e){};true;`);

  // After the first paint, redraw pins and move the camera only when they actually change.
  const drawn = useRef(layers);
  const framed = useRef(camera);
  useEffect(() => { if (ready && drawn.current !== layers) { drawn.current = layers; run(`draw(${layers})`); } }, [layers, ready]);
  useEffect(() => { if (ready && framed.current !== camera) { framed.current = camera; run(`view(${camera},true)`); } }, [camera, ready]);

  useImperativeHandle(ref, () => ({ flyTo: (at, zoom) => run(`fly(${JSON.stringify(at)},${zoom ?? 0})`) }));

  return (
    <View style={{ flex: 1, backgroundColor: '#ECE9E3' }}>
      <WebView
        ref={web}
        source={{ html, baseUrl: ORIGIN }}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: '#ECE9E3' }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        overScrollMode="never"
        setSupportMultipleWindows={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // Never navigate away from the map (the attribution links, say).
        onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith(ORIGIN) || r.url.startsWith('data:')}
        onError={() => setFailed(true)}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data) as { t: string; lat?: number; lng?: number };
            if (m.t === 'ready') { setReady(true); setFailed(false); }
            else if (m.t === 'error') setFailed(true);
            else if (m.t === 'move' && onMoveEnd && typeof m.lat === 'number' && typeof m.lng === 'number') onMoveEnd({ lat: m.lat, lng: m.lng });
          } catch { /* not ours */ }
        }}
      />
      {failed ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 13, color: '#5B5F6B', textAlign: 'center' }}>The map needs internet to load. Check the connection and open this screen again.</Text>
        </View>
      ) : null}
    </View>
  );
});
