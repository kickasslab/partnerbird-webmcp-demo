import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type OwnerReplyEmailProps = {
  visitorName: string;
  profileName: string;
  messagePreview: string;
  resumeUrl: string;
};

export function OwnerReplyEmail({
  visitorName,
  profileName,
  messagePreview,
  resumeUrl,
}: OwnerReplyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{profileName} replied to your PartnerBird conversation</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>PartnerBird</Text>
          <Heading style={headingStyle}>{profileName} replied</Heading>
          <Text style={copyStyle}>Hi {visitorName},</Text>
          <Section style={messageStyle}>
            <Text style={messageCopyStyle}>{messagePreview}</Text>
          </Section>
          <Section style={buttonSectionStyle}>
            <Button href={resumeUrl} style={buttonStyle}>
              Open conversation
            </Button>
          </Section>
          <Text style={mutedStyle}>
            Open PartnerBird to reply securely. Your private link should not be forwarded.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  margin: 0,
  backgroundColor: "#f4f5f7",
  color: "#17191d",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const containerStyle = {
  margin: "32px auto",
  maxWidth: "560px",
  border: "1px solid #dfe3e8",
  borderRadius: "18px",
  backgroundColor: "#ffffff",
  padding: "34px",
};

const brandStyle = {
  margin: "0 0 22px",
  color: "#138a4a",
  fontSize: "15px",
  fontWeight: 700,
};

const headingStyle = {
  margin: "0 0 18px",
  color: "#17191d",
  fontSize: "28px",
  lineHeight: "34px",
  letterSpacing: "-0.8px",
};

const copyStyle = {
  margin: "0 0 14px",
  color: "#454a52",
  fontSize: "15px",
  lineHeight: "24px",
};

const messageStyle = {
  margin: "20px 0",
  borderLeft: "3px solid #138a4a",
  borderRadius: "0 10px 10px 0",
  backgroundColor: "#f4faf6",
  padding: "14px 16px",
};

const messageCopyStyle = {
  margin: 0,
  color: "#2e3339",
  fontSize: "14px",
  lineHeight: "22px",
  whiteSpace: "pre-wrap" as const,
};

const buttonSectionStyle = { margin: "26px 0" };

const buttonStyle = {
  borderRadius: "10px",
  backgroundColor: "#138a4a",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 700,
  padding: "13px 20px",
  textDecoration: "none",
};

const mutedStyle = {
  margin: 0,
  color: "#767c85",
  fontSize: "12px",
  lineHeight: "19px",
};
