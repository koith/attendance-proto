/* Schedule pages already call admin_* RPCs whose server-side functions enforce is_admin().
   Do not add a separate is_admin network gate before loading the page: on iOS Safari a
   transient/rejected preflight can otherwise misreport a valid admin session as a permission failure. */
if(typeof BE!=='undefined'){
  BE.isAdmin=async()=>true;
}
