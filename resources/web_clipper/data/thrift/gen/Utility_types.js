//
// Autogenerated by Thrift Compiler (0.5.0-en-exported)
//
// DO NOT EDIT UNLESS YOU ARE SURE THAT YOU KNOW WHAT YOU ARE DOING
//

MarketingEmailType = {
'DESKTOP_UPSELL' : 1
};
SupportTicket = function(args) {
  this.applicationVersion = null;
  this.contactEmail = null;
  this.osInfo = null;
  this.deviceInfo = null;
  this.carrierInfo = null;
  this.connectionInfo = null;
  this.logFile = null;
  this.subject = null;
  this.issueDescription = null;
  if (args) {
    if (args.applicationVersion !== undefined) {
      this.applicationVersion = args.applicationVersion;
    }
    if (args.contactEmail !== undefined) {
      this.contactEmail = args.contactEmail;
    }
    if (args.osInfo !== undefined) {
      this.osInfo = args.osInfo;
    }
    if (args.deviceInfo !== undefined) {
      this.deviceInfo = args.deviceInfo;
    }
    if (args.carrierInfo !== undefined) {
      this.carrierInfo = args.carrierInfo;
    }
    if (args.connectionInfo !== undefined) {
      this.connectionInfo = args.connectionInfo;
    }
    if (args.logFile !== undefined) {
      this.logFile = args.logFile;
    }
    if (args.subject !== undefined) {
      this.subject = args.subject;
    }
    if (args.issueDescription !== undefined) {
      this.issueDescription = args.issueDescription;
    }
  }
};
SupportTicket.prototype = {};
SupportTicket.prototype.read = function(input) {
  input.readStructBegin();
  while (true)
  {
    var ret = input.readFieldBegin();
    var fname = ret.fname;
    var ftype = ret.ftype;
    var fid = ret.fid;
    if (ftype == Thrift.Type.STOP) {
      break;
    }
    switch (fid)
    {
      case 1:
      if (ftype == Thrift.Type.STRING) {
        this.applicationVersion = input.readString().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 2:
      if (ftype == Thrift.Type.STRING) {
        this.contactEmail = input.readString().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 3:
      if (ftype == Thrift.Type.STRING) {
        this.osInfo = input.readString().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 4:
      if (ftype == Thrift.Type.STRING) {
        this.deviceInfo = input.readString().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 5:
      if (ftype == Thrift.Type.STRING) {
        this.carrierInfo = input.readString().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 6:
      if (ftype == Thrift.Type.STRING) {
        this.connectionInfo = input.readString().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 7:
      if (ftype == Thrift.Type.STRUCT) {
        this.logFile = new Data();
        this.logFile.read(input);
      } else {
        input.skip(ftype);
      }
      break;
      case 8:
      if (ftype == Thrift.Type.STRING) {
        this.subject = input.readString().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 9:
      if (ftype == Thrift.Type.STRING) {
        this.issueDescription = input.readString().value;
      } else {
        input.skip(ftype);
      }
      break;
      default:
        input.skip(ftype);
    }
    input.readFieldEnd();
  }
  input.readStructEnd();
  return;
};

SupportTicket.prototype.write = function(output) {
  output.writeStructBegin('SupportTicket');
  if (this.applicationVersion !== null && this.applicationVersion !== undefined) {
    output.writeFieldBegin('applicationVersion', Thrift.Type.STRING, 1);
    output.writeString(this.applicationVersion);
    output.writeFieldEnd();
  }
  if (this.contactEmail !== null && this.contactEmail !== undefined) {
    output.writeFieldBegin('contactEmail', Thrift.Type.STRING, 2);
    output.writeString(this.contactEmail);
    output.writeFieldEnd();
  }
  if (this.osInfo !== null && this.osInfo !== undefined) {
    output.writeFieldBegin('osInfo', Thrift.Type.STRING, 3);
    output.writeString(this.osInfo);
    output.writeFieldEnd();
  }
  if (this.deviceInfo !== null && this.deviceInfo !== undefined) {
    output.writeFieldBegin('deviceInfo', Thrift.Type.STRING, 4);
    output.writeString(this.deviceInfo);
    output.writeFieldEnd();
  }
  if (this.carrierInfo !== null && this.carrierInfo !== undefined) {
    output.writeFieldBegin('carrierInfo', Thrift.Type.STRING, 5);
    output.writeString(this.carrierInfo);
    output.writeFieldEnd();
  }
  if (this.connectionInfo !== null && this.connectionInfo !== undefined) {
    output.writeFieldBegin('connectionInfo', Thrift.Type.STRING, 6);
    output.writeString(this.connectionInfo);
    output.writeFieldEnd();
  }
  if (this.logFile !== null && this.logFile !== undefined) {
    output.writeFieldBegin('logFile', Thrift.Type.STRUCT, 7);
    this.logFile.write(output);
    output.writeFieldEnd();
  }
  if (this.subject !== null && this.subject !== undefined) {
    output.writeFieldBegin('subject', Thrift.Type.STRING, 8);
    output.writeString(this.subject);
    output.writeFieldEnd();
  }
  if (this.issueDescription !== null && this.issueDescription !== undefined) {
    output.writeFieldBegin('issueDescription', Thrift.Type.STRING, 9);
    output.writeString(this.issueDescription);
    output.writeFieldEnd();
  }
  output.writeFieldStop();
  output.writeStructEnd();
  return;
};

AppFeedback = function(args) {
  this.rating = null;
  this.feedback = null;
  if (args) {
    if (args.rating !== undefined) {
      this.rating = args.rating;
    }
    if (args.feedback !== undefined) {
      this.feedback = args.feedback;
    }
  }
};
AppFeedback.prototype = {};
AppFeedback.prototype.read = function(input) {
  input.readStructBegin();
  while (true)
  {
    var ret = input.readFieldBegin();
    var fname = ret.fname;
    var ftype = ret.ftype;
    var fid = ret.fid;
    if (ftype == Thrift.Type.STOP) {
      break;
    }
    switch (fid)
    {
      case 1:
      if (ftype == Thrift.Type.BYTE) {
        this.rating = input.readByte().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 2:
      if (ftype == Thrift.Type.STRUCT) {
        this.feedback = new SupportTicket();
        this.feedback.read(input);
      } else {
        input.skip(ftype);
      }
      break;
      default:
        input.skip(ftype);
    }
    input.readFieldEnd();
  }
  input.readStructEnd();
  return;
};

AppFeedback.prototype.write = function(output) {
  output.writeStructBegin('AppFeedback');
  if (this.rating !== null && this.rating !== undefined) {
    output.writeFieldBegin('rating', Thrift.Type.BYTE, 1);
    output.writeByte(this.rating);
    output.writeFieldEnd();
  }
  if (this.feedback !== null && this.feedback !== undefined) {
    output.writeFieldBegin('feedback', Thrift.Type.STRUCT, 2);
    this.feedback.write(output);
    output.writeFieldEnd();
  }
  output.writeFieldStop();
  output.writeStructEnd();
  return;
};

MarketingEmailParameters = function(args) {
  this.marketingEmailType = null;
  if (args) {
    if (args.marketingEmailType !== undefined) {
      this.marketingEmailType = args.marketingEmailType;
    }
  }
};
MarketingEmailParameters.prototype = {};
MarketingEmailParameters.prototype.read = function(input) {
  input.readStructBegin();
  while (true)
  {
    var ret = input.readFieldBegin();
    var fname = ret.fname;
    var ftype = ret.ftype;
    var fid = ret.fid;
    if (ftype == Thrift.Type.STOP) {
      break;
    }
    switch (fid)
    {
      case 1:
      if (ftype == Thrift.Type.I32) {
        this.marketingEmailType = input.readI32().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 0:
        input.skip(ftype);
        break;
      default:
        input.skip(ftype);
    }
    input.readFieldEnd();
  }
  input.readStructEnd();
  return;
};

MarketingEmailParameters.prototype.write = function(output) {
  output.writeStructBegin('MarketingEmailParameters');
  if (this.marketingEmailType !== null && this.marketingEmailType !== undefined) {
    output.writeFieldBegin('marketingEmailType', Thrift.Type.I32, 1);
    output.writeI32(this.marketingEmailType);
    output.writeFieldEnd();
  }
  output.writeFieldStop();
  output.writeStructEnd();
  return;
};

CrossPromotionInfo = function(args) {
  this.usesEvernoteWindows = null;
  this.usesEvernoteMac = null;
  this.usesEvernoteIOS = null;
  this.usesEvernoteAndroid = null;
  this.usesWebClipper = null;
  this.usesClearly = null;
  this.usesFoodIOS = null;
  this.usesFoodAndroid = null;
  this.usesPenultimateIOS = null;
  this.usesSkitchWindows = null;
  this.usesSkitchMac = null;
  this.usesSkitchIOS = null;
  this.usesSkitchAndroid = null;
  if (args) {
    if (args.usesEvernoteWindows !== undefined) {
      this.usesEvernoteWindows = args.usesEvernoteWindows;
    }
    if (args.usesEvernoteMac !== undefined) {
      this.usesEvernoteMac = args.usesEvernoteMac;
    }
    if (args.usesEvernoteIOS !== undefined) {
      this.usesEvernoteIOS = args.usesEvernoteIOS;
    }
    if (args.usesEvernoteAndroid !== undefined) {
      this.usesEvernoteAndroid = args.usesEvernoteAndroid;
    }
    if (args.usesWebClipper !== undefined) {
      this.usesWebClipper = args.usesWebClipper;
    }
    if (args.usesClearly !== undefined) {
      this.usesClearly = args.usesClearly;
    }
    if (args.usesFoodIOS !== undefined) {
      this.usesFoodIOS = args.usesFoodIOS;
    }
    if (args.usesFoodAndroid !== undefined) {
      this.usesFoodAndroid = args.usesFoodAndroid;
    }
    if (args.usesPenultimateIOS !== undefined) {
      this.usesPenultimateIOS = args.usesPenultimateIOS;
    }
    if (args.usesSkitchWindows !== undefined) {
      this.usesSkitchWindows = args.usesSkitchWindows;
    }
    if (args.usesSkitchMac !== undefined) {
      this.usesSkitchMac = args.usesSkitchMac;
    }
    if (args.usesSkitchIOS !== undefined) {
      this.usesSkitchIOS = args.usesSkitchIOS;
    }
    if (args.usesSkitchAndroid !== undefined) {
      this.usesSkitchAndroid = args.usesSkitchAndroid;
    }
  }
};
CrossPromotionInfo.prototype = {};
CrossPromotionInfo.prototype.read = function(input) {
  input.readStructBegin();
  while (true)
  {
    var ret = input.readFieldBegin();
    var fname = ret.fname;
    var ftype = ret.ftype;
    var fid = ret.fid;
    if (ftype == Thrift.Type.STOP) {
      break;
    }
    switch (fid)
    {
      case 1:
      if (ftype == Thrift.Type.BOOL) {
        this.usesEvernoteWindows = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 2:
      if (ftype == Thrift.Type.BOOL) {
        this.usesEvernoteMac = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 3:
      if (ftype == Thrift.Type.BOOL) {
        this.usesEvernoteIOS = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 4:
      if (ftype == Thrift.Type.BOOL) {
        this.usesEvernoteAndroid = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 5:
      if (ftype == Thrift.Type.BOOL) {
        this.usesWebClipper = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 6:
      if (ftype == Thrift.Type.BOOL) {
        this.usesClearly = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 7:
      if (ftype == Thrift.Type.BOOL) {
        this.usesFoodIOS = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 8:
      if (ftype == Thrift.Type.BOOL) {
        this.usesFoodAndroid = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 9:
      if (ftype == Thrift.Type.BOOL) {
        this.usesPenultimateIOS = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 10:
      if (ftype == Thrift.Type.BOOL) {
        this.usesSkitchWindows = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 11:
      if (ftype == Thrift.Type.BOOL) {
        this.usesSkitchMac = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 12:
      if (ftype == Thrift.Type.BOOL) {
        this.usesSkitchIOS = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      case 13:
      if (ftype == Thrift.Type.BOOL) {
        this.usesSkitchAndroid = input.readBool().value;
      } else {
        input.skip(ftype);
      }
      break;
      default:
        input.skip(ftype);
    }
    input.readFieldEnd();
  }
  input.readStructEnd();
  return;
};

CrossPromotionInfo.prototype.write = function(output) {
  output.writeStructBegin('CrossPromotionInfo');
  if (this.usesEvernoteWindows !== null && this.usesEvernoteWindows !== undefined) {
    output.writeFieldBegin('usesEvernoteWindows', Thrift.Type.BOOL, 1);
    output.writeBool(this.usesEvernoteWindows);
    output.writeFieldEnd();
  }
  if (this.usesEvernoteMac !== null && this.usesEvernoteMac !== undefined) {
    output.writeFieldBegin('usesEvernoteMac', Thrift.Type.BOOL, 2);
    output.writeBool(this.usesEvernoteMac);
    output.writeFieldEnd();
  }
  if (this.usesEvernoteIOS !== null && this.usesEvernoteIOS !== undefined) {
    output.writeFieldBegin('usesEvernoteIOS', Thrift.Type.BOOL, 3);
    output.writeBool(this.usesEvernoteIOS);
    output.writeFieldEnd();
  }
  if (this.usesEvernoteAndroid !== null && this.usesEvernoteAndroid !== undefined) {
    output.writeFieldBegin('usesEvernoteAndroid', Thrift.Type.BOOL, 4);
    output.writeBool(this.usesEvernoteAndroid);
    output.writeFieldEnd();
  }
  if (this.usesWebClipper !== null && this.usesWebClipper !== undefined) {
    output.writeFieldBegin('usesWebClipper', Thrift.Type.BOOL, 5);
    output.writeBool(this.usesWebClipper);
    output.writeFieldEnd();
  }
  if (this.usesClearly !== null && this.usesClearly !== undefined) {
    output.writeFieldBegin('usesClearly', Thrift.Type.BOOL, 6);
    output.writeBool(this.usesClearly);
    output.writeFieldEnd();
  }
  if (this.usesFoodIOS !== null && this.usesFoodIOS !== undefined) {
    output.writeFieldBegin('usesFoodIOS', Thrift.Type.BOOL, 7);
    output.writeBool(this.usesFoodIOS);
    output.writeFieldEnd();
  }
  if (this.usesFoodAndroid !== null && this.usesFoodAndroid !== undefined) {
    output.writeFieldBegin('usesFoodAndroid', Thrift.Type.BOOL, 8);
    output.writeBool(this.usesFoodAndroid);
    output.writeFieldEnd();
  }
  if (this.usesPenultimateIOS !== null && this.usesPenultimateIOS !== undefined) {
    output.writeFieldBegin('usesPenultimateIOS', Thrift.Type.BOOL, 9);
    output.writeBool(this.usesPenultimateIOS);
    output.writeFieldEnd();
  }
  if (this.usesSkitchWindows !== null && this.usesSkitchWindows !== undefined) {
    output.writeFieldBegin('usesSkitchWindows', Thrift.Type.BOOL, 10);
    output.writeBool(this.usesSkitchWindows);
    output.writeFieldEnd();
  }
  if (this.usesSkitchMac !== null && this.usesSkitchMac !== undefined) {
    output.writeFieldBegin('usesSkitchMac', Thrift.Type.BOOL, 11);
    output.writeBool(this.usesSkitchMac);
    output.writeFieldEnd();
  }
  if (this.usesSkitchIOS !== null && this.usesSkitchIOS !== undefined) {
    output.writeFieldBegin('usesSkitchIOS', Thrift.Type.BOOL, 12);
    output.writeBool(this.usesSkitchIOS);
    output.writeFieldEnd();
  }
  if (this.usesSkitchAndroid !== null && this.usesSkitchAndroid !== undefined) {
    output.writeFieldBegin('usesSkitchAndroid', Thrift.Type.BOOL, 13);
    output.writeBool(this.usesSkitchAndroid);
    output.writeFieldEnd();
  }
  output.writeFieldStop();
  output.writeStructEnd();
  return;
};
