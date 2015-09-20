<xsl:stylesheet version="1.0"
xmlns:h="http://www.w3.org/1999/xhtml"
xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
xmlns:en="http://xml.evernote.com/pub/enml2.dtd"
exclude-result-prefixes="#default h">
<xsl:output method="xml"
  omit-xml-declaration="no"
  doctype-system = "http://xml.evernote.com/pub/enml2.dtd"
  encoding="utf-8"/>

<xsl:template match="/" priority="1">
   <xsl:element name="en-note">
      <div style="position:relative;">
        <xsl:apply-templates select="/*" />
      </div>
  </xsl:element>
</xsl:template>
<!--
<xsl:template match="/">
  <html>
    <xsl:apply-templates select="node()"/>
  </html>
</xsl:template>
-->

<xsl:template match="text()">
    <xsl:copy/>
</xsl:template>

<xsl:template match="@title" mode="coreattrs" >
    <xsl:copy/>
</xsl:template>

<xsl:template match="@lang|@dir" mode="i18n" >
    <xsl:copy/>
</xsl:template>

<xsl:template match="@accesskey|@tabindex" mode="focus" >
    <xsl:copy/>
</xsl:template>

<xsl:template match="@title|@lang|@dir" mode="common" >
    <xsl:copy/>
</xsl:template>

<xsl:template match="@align" mode="TextAlign" >
    <xsl:copy/>
</xsl:template>

<xsl:template match="@align|@char|@charoff" mode="cellhalign" >
    <xsl:copy/>
</xsl:template>

<xsl:template match="@valign" mode="cellvalign" >
    <xsl:copy/>
</xsl:template>

<xsl:template match="@*" mode="attr">
  <xsl:copy/>
</xsl:template>

<xsl:template match="@xyzzy|@*[starts-with(local-name(), 'data-')]" priority="1">
    <xsl:copy/>
</xsl:template>

<xsl:template match="h:abbr|h:bdo|h:acronym|h:address|h:b|h:big|h:center|h:cite|h:code|
  h:dd|h:dfn|h:dt|h:em|h:i|h:kbs|h:s|h:samp|h:small|h:span|h:strike|h:strong|
  h:sub|h:sup|h:tt|h:u|h:var">
  <xsl:element name="{local-name()}">
    <xsl:apply-templates select="@xyzzy"/>
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="*|text()" />
  </xsl:element>
</xsl:template>

<xsl:template match="h:div|h:h1|h:h2|h:h3|h:h4|h:h5|h:h6|h:caption">
  <xsl:element name="{local-name()}">
    <xsl:apply-templates select="@xyzzy"/>
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="*|text()" />
  </xsl:element>
</xsl:template>

<xsl:template match="h:a">
  <a xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@accesskey|@tabindex" mode="attr"/> <!-- %focus -->
    <xsl:apply-templates select="@charset|@type|@name|@href|@hreflang|@rel|@rev|@shape|@coords|@target" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </a>
</xsl:template>

<xsl:template match="h:area">
  <area xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@accesskey|@tabindex" mode="attr"/> <!-- %focus -->
    <xsl:apply-templates select="@shape|@coords|@href|@nohref|@alt|@target" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </area>
</xsl:template>

<xsl:template match="h:li">
  <li xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir|@align" mode="attr"/>
    <xsl:apply-templates select="@type|@value" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </li>
</xsl:template>

<xsl:template match="h:ol">
  <ol xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir|@align" mode="attr"/>
    <xsl:apply-templates select="@type|@compact|@start" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </ol>
</xsl:template>

<xsl:template match="h:p">
  <p xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir|@align" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </p>
</xsl:template>
<xsl:template match="h:pre">
        <pre xyzzy="{@xyzzy}">
            <xsl:apply-templates select="@title|@lang|@dir|@align" mode="attr"/>
            <xsl:apply-templates select="*|text()" />
        </pre>
 </xsl:template>
<xsl:template match="h:q">
        <q xyzzy="{@xyzzy}">
            <xsl:apply-templates select="@title|@lang|@dir|@align|@cite" mode="attr"/>
            <xsl:apply-templates select="*|text()" />
        </q>
</xsl:template>

<xsl:template match="h:ul">
  <ul xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir|@align" mode="attr"/>
    <xsl:apply-templates select="@type|@compact" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </ul>
</xsl:template>

<!-- elements not in DTD -->
<xsl:template match="h:head|h:data|h:script|h:noscript|h:style|h:select|h:option|h:optgroup|h:noembed
  |h:title|h:meta|h:link" />

<xsl:template match="h:body">
  <div xform="body" xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@lang|@dir|@align" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </div>
</xsl:template>

<xsl:template match="h:img|h:image">
  <en-media xyzzy="{@xyzzy}" xform="img">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/>
    <xsl:apply-templates select="@src|@alt|@longdesc|@height|@width|@usemap|@ismap|@align|@border|@hspace|@vspace" mode="attr"/>
  </en-media>
</xsl:template>

<xsl:template match="h:iframe">
  <en-media xyzzy="{@xyzzy}" xform="iframe">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@src|@alt|@longdesc|@height|@width|@border|@hspace|@vspace" mode="attr"/>
  </en-media>
</xsl:template>

<xsl:template match="h:canvas">
  <en-media xyzzy="{@xyzzy}" xform="canvas">
     <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
     <xsl:apply-templates select="@src|@alt|@longdesc|@height|@width|@border|@hspace|@vspace" mode="attr"/>
  </en-media>
</xsl:template>

<xsl:template match="h:img-x|h:image-x">
  <img xyzzy="{@xyzzy}" xform="img">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/>
    <xsl:apply-templates select="@src|@alt|@longdesc|@height|@width|@usemap|@ismap|@align|@border|@hspace|@vspace" mode="attr"/>
  </img>
</xsl:template>

<xsl:template match="h:iframe-x">
  <iframe xyzzy="{@xyzzy}" xform="iframe">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@src|@alt|@longdesc|@height|@width|@border|@hspace|@vspace" mode="attr"/>
  </iframe>
</xsl:template>


<xsl:template match="h:font">
  <font xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@size|@color|@face" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </font>
</xsl:template>

<xsl:template match="h:table">
  <table xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@summary|@width|@border|@cellspacing|@cellpadding|@align|@bgcolor" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </table>
</xsl:template>

<xsl:template match="h:tbody">
  <tbody xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@align|@valign|@char|@charoff" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </tbody>
</xsl:template>

<xsl:template match="h:thead">
  <thead xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@align|@valign|@char|@charoff" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </thead>
</xsl:template>

<xsl:template match="h:tfoot">
  <tfoot xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@align|@valign|@char|@charoff" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </tfoot>
</xsl:template>

<xsl:template match="h:tr">
  <tr xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@align|@valign|@char|@charoff|@bgcolor" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </tr>
</xsl:template>

<xsl:template match="h:td">
  <td xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@abbr|@rowspan|@colspan|@nowrap|@width|@height|@align|@valign|@char|@charoff|@bgcolor" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </td>
</xsl:template>

<xsl:template match="h:th">
  <th xyzzy="{@xyzzy}">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/> <!-- %attrs -->
    <xsl:apply-templates select="@abbr|@rowspan|@colspan|@nowrap|@width|@height|@align|@valign|@char|@charoff|@bgcolor" mode="attr"/>
    <xsl:apply-templates select="*|text()" />
  </th>
</xsl:template>

<!-- conversions -->
<xsl:template match="h:fieldset|h:aside|h:article|h:details|h:form|h:footer|h:figure|h:figcaption|h:header|h:nav|h:section|h:hgroup|h:summary|h:*" priority="-1" >
  <xsl:element name="div">
    <xsl:attribute name="xyzzy"><xsl:value-of select="@xyzzy" /></xsl:attribute>
    <xsl:attribute name="xform"><xsl:value-of select="local-name()" /></xsl:attribute>
    <xsl:apply-templates select="@title|@lang|@dir|@align" mode="attr"/>
    <xsl:apply-templates select="node()" />
  </xsl:element>
</xsl:template>

<xsl:template match="h:label|h:date|h:button|h:legend">
  <xsl:element name="span">
    <xsl:attribute name="xyzzy"><xsl:value-of select="@xyzzy" /></xsl:attribute>
    <xsl:attribute name="xform"><xsl:value-of select="local-name()" /></xsl:attribute>
    <xsl:apply-templates select="*|text()" />
  </xsl:element>
</xsl:template>
<!--
<xsl:template match="h:img|h:image">
  <en-media xyzzy="{@xyzzy}" xform="img">
    <xsl:apply-templates select="@title|@lang|@dir" mode="attr"/>
    <xsl:apply-templates select="@src|@alt|@name|@longdesc|@height|@width|@usemap|@ismap|@align|@border|@hspace|@vspace" mode="attr"/>
  </en-media>
</xsl:template>
<!ELEMENT b %AnyContent;>
<!ATTLIST b
  %attrs;
  >

<!ELEMENT bdo %AnyContent;>
<!ATTLIST bdo
  %coreattrs;
  lang        CDATA #IMPLIED
  xml:lang    CDATA #IMPLIED
  dir         CDATA #IMPLIED
  >

<!ELEMENT big %AnyContent;>
<!ATTLIST big
  %attrs;
  >

<!ELEMENT blockquote %AnyContent;>
<!ATTLIST blockquote
  %attrs;
  cite        CDATA #IMPLIED
  >

<!ELEMENT br %AnyContent;>
<!ATTLIST br
  %coreattrs;
  clear       CDATA #IMPLIED
  >

<!ELEMENT caption %AnyContent;>
<!ATTLIST caption
  %attrs;
  align       CDATA #IMPLIED
  >

<!ELEMENT center %AnyContent;>
<!ATTLIST center
  %attrs;
  >

<!ELEMENT cite %AnyContent;>
<!ATTLIST cite
  %attrs;
  >

<!ELEMENT code %AnyContent;>
<!ATTLIST code
  %attrs;
  >

<!ELEMENT col %AnyContent;>
<!ATTLIST col
  %attrs;
  %cellhalign;
  %cellvalign;
  span        CDATA #IMPLIED
  width       CDATA #IMPLIED
  >

<!ELEMENT colgroup %AnyContent;>
<!ATTLIST colgroup
  %attrs;
  %cellhalign;
  %cellvalign;
  span        CDATA  #IMPLIED
  width       CDATA  #IMPLIED
  >

<!ELEMENT dd %AnyContent;>
<!ATTLIST dd
  %attrs;
  >

<!ELEMENT del %AnyContent;>
<!ATTLIST del
  %attrs;
  cite        CDATA #IMPLIED
  datetime    CDATA #IMPLIED
  >

<!ELEMENT dfn %AnyContent;>
<!ATTLIST dfn
  %attrs;
  >

<!ELEMENT div %AnyContent;>
<!ATTLIST div
  %attrs;
  %TextAlign;
  >

<!ELEMENT dl %AnyContent;>
<!ATTLIST dl
  %attrs;
  compact     CDATA #IMPLIED
  >

<!ELEMENT dt %AnyContent;>
<!ATTLIST dt
  %attrs;
  >

<!ELEMENT em %AnyContent;>
<!ATTLIST em
  %attrs;
  >

<!ELEMENT font %AnyContent;>
<!ATTLIST font
  %coreattrs;
  %i18n;
  size        CDATA #IMPLIED
  color       CDATA #IMPLIED
  face        CDATA #IMPLIED
  >

<!ELEMENT h1 %AnyContent;>
<!ATTLIST h1
  %attrs;
  %TextAlign;
  >

<!ELEMENT h2 %AnyContent;>
<!ATTLIST h2
  %attrs;
  %TextAlign;
  >

<!ELEMENT h3 %AnyContent;>
<!ATTLIST h3
  %attrs;
  %TextAlign;
  >

<!ELEMENT h4 %AnyContent;>
<!ATTLIST h4
  %attrs;
  %TextAlign;
  >

<!ELEMENT h5 %AnyContent;>
<!ATTLIST h5
  %attrs;
  %TextAlign;
  >

<!ELEMENT h6 %AnyContent;>
<!ATTLIST h6
  %attrs;
  %TextAlign;
  >

<!ELEMENT hr %AnyContent;>
<!ATTLIST hr
  %attrs;
  align       CDATA #IMPLIED
  noshade     CDATA #IMPLIED
  size        CDATA #IMPLIED
  width       CDATA #IMPLIED
  >

<!ELEMENT i %AnyContent;>
<!ATTLIST i
  %attrs;
  >

<!ELEMENT img %AnyContent;>
<!ATTLIST img
  %attrs;
  src         CDATA #IMPLIED
  alt         CDATA #IMPLIED
  name        CDATA #IMPLIED
  longdesc    CDATA #IMPLIED
  height      CDATA #IMPLIED
  width       CDATA #IMPLIED
  usemap      CDATA #IMPLIED
  ismap       CDATA #IMPLIED
  align       CDATA #IMPLIED
  border      CDATA #IMPLIED
  hspace      CDATA #IMPLIED
  vspace      CDATA #IMPLIED
  >

<!ELEMENT ins %AnyContent;>
<!ATTLIST ins
  %attrs;
  cite        CDATA #IMPLIED
  datetime    CDATA #IMPLIED
  >

<!ELEMENT kbd %AnyContent;>
<!ATTLIST kbd
  %attrs;
  >

<!ELEMENT li %AnyContent;>
<!ATTLIST li
  %attrs;
  type        CDATA #IMPLIED
  value       CDATA #IMPLIED
  >

<!ELEMENT map %AnyContent;>
<!ATTLIST map
  %i18n;
  title       CDATA #IMPLIED
  name        CDATA #IMPLIED
  >

<!ELEMENT ol %AnyContent;>
<!ATTLIST ol
  %attrs;
  type        CDATA #IMPLIED
  compact     CDATA #IMPLIED
  start       CDATA #IMPLIED
  >

<!ELEMENT p %AnyContent;>
<!ATTLIST p
  %attrs;
  %TextAlign;
  >

<!ELEMENT pre %AnyContent;>
<!ATTLIST pre
  %attrs;
  width       CDATA #IMPLIED
  xml:space   (preserve)    #FIXED 'preserve'
  >

<!ELEMENT q %AnyContent;>
<!ATTLIST q
  %attrs;
  cite        CDATA #IMPLIED
  >

<!ELEMENT s %AnyContent;>
<!ATTLIST s
  %attrs;
  >

<!ELEMENT samp %AnyContent;>
<!ATTLIST samp
  %attrs;
  >

<!ELEMENT small %AnyContent;>
<!ATTLIST small
  %attrs;
  >

<!ELEMENT span %AnyContent;>
<!ATTLIST span
  %attrs;
  >

<!ELEMENT strike %AnyContent;>
<!ATTLIST strike
  %attrs;
  >

<!ELEMENT strong %AnyContent;>
<!ATTLIST strong
  %attrs;
  >

<!ELEMENT sub %AnyContent;>
<!ATTLIST sub
  %attrs;
  >

<!ELEMENT sup %AnyContent;>
<!ATTLIST sup
  %attrs;
  >

<!ELEMENT table %AnyContent;>
<!ATTLIST table
  %attrs;
  summary     CDATA #IMPLIED
  width       CDATA #IMPLIED
  border      CDATA #IMPLIED
  cellspacing CDATA #IMPLIED
  cellpadding CDATA #IMPLIED
  align       CDATA #IMPLIED
  bgcolor     CDATA #IMPLIED
  >

<!ELEMENT tbody %AnyContent;>
<!ATTLIST tbody
  %attrs;
  %cellhalign;
  %cellvalign;
  >

<!ELEMENT td %AnyContent;>
<!ATTLIST td
  %attrs;
  %cellhalign;
  %cellvalign;
  abbr        CDATA #IMPLIED
  rowspan     CDATA #IMPLIED
  colspan     CDATA #IMPLIED
  nowrap      CDATA #IMPLIED
  bgcolor     CDATA #IMPLIED
  width       CDATA #IMPLIED
  height      CDATA #IMPLIED
  >

<!ELEMENT tfoot %AnyContent;>
<!ATTLIST tfoot
  %attrs;
  %cellhalign;
  %cellvalign;
  >

<!ELEMENT th %AnyContent;>
<!ATTLIST th
  %attrs;
  %cellhalign;
  %cellvalign;
  abbr        CDATA #IMPLIED
  rowspan     CDATA #IMPLIED
  colspan     CDATA #IMPLIED
  nowrap      CDATA #IMPLIED
  bgcolor     CDATA #IMPLIED
  width       CDATA #IMPLIED
  height      CDATA #IMPLIED
  >

<!ELEMENT thead %AnyContent;>
<!ATTLIST thead
  %attrs;
  %cellhalign;
  %cellvalign;
  >

<!ELEMENT tr %AnyContent;>
<!ATTLIST tr
  %attrs;
  %cellhalign;
  %cellvalign;
  bgcolor     CDATA #IMPLIED
  >

<!ELEMENT tt %AnyContent;>
<!ATTLIST tt
  %attrs;
  >

<!ELEMENT u %AnyContent;>
<!ATTLIST u
  %attrs;
  >

<!ELEMENT ul %AnyContent;>
<!ATTLIST ul
  %attrs;
  type        CDATA #IMPLIED
  compact     CDATA #IMPLIED
  >

<!ELEMENT var %AnyContent;>
<!ATTLIST var
  %attrs;
  >
-->
</xsl:stylesheet>
