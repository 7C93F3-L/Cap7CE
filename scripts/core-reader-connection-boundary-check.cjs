const fs=require('node:fs'),path=require('node:path');
module.exports=(root,failures)=>{
 const read=file=>fs.readFileSync(path.join(root,file),'utf8'),lifetime=read('core/src/Cap7CE.Core.Reader.Host/ReaderConnectionLifetime.cs'),service=read('core/src/Cap7CE.Core.Reader.Host/ReaderVolumeService.cs'),client=read('core/src/Cap7CE.Core.Host/ReaderV2CatalogSession.cs');
 if(lifetime.split(/\r?\n/).length>60||/File\.|Directory\.|System\.Net|Process\.|Thread\.Sleep|Task\.Delay/.test(lifetime))failures.push('Reader connection lifetime must be a small pure cancellation owner.');
 for(const anchor of ['Timeout.InfiniteTimeSpan','authenticated = true','admission?.Dispose()','!authenticated && !disposed','Token.ThrowIfCancellationRequested()'])if(!lifetime.includes(anchor))failures.push('Reader admission/lifetime boundary missing '+anchor);
 const authenticated=service.indexOf('deadline.Authenticate()');if(authenticated<service.indexOf('clientChecked = AuthenticateClient')||authenticated>service.indexOf('stage = "volume-session"')||authenticated<0)failures.push('Admission may retire only after PID/token/hello authentication and before the volume loop.');
 if(!service.includes('ReaderCapabilities.AuthenticatedSessions')||!client.includes('requireAuthenticatedSession: true')||!client.includes('throw new ReaderRepairRequiredException("reader-authenticated-session-unavailable")'))failures.push('Product Core must reject old finite-session Reader capability into explicit repair.');
};
